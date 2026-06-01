import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import Stripe from 'stripe';
import { PlanId, PLANS } from '../common/constants/plans';
import { Organization } from '../organizations/schemas/organization.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { User } from '../users/schemas/user.schema';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  // Stripe SDK instance (typed loosely for Nest isolatedModules compatibility)
  private readonly stripe: InstanceType<typeof Stripe> | null;
  private readonly mockMode: boolean;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Organization.name) private readonly orgModel: Model<Organization>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly organizationsService: OrganizationsService,
  ) {
    const key = this.config.get<string>('STRIPE_SECRET_KEY');
    const forceMock = this.config.get('BILLING_MOCK') === 'true';
    this.mockMode = forceMock || !key;
    this.stripe = key ? new Stripe(key) : null;
    if (this.mockMode) {
      this.logger.warn(
        'Stripe is not configured or BILLING_MOCK=true. Billing endpoints will run in mock mode.',
      );
    }
  }

  listPlans() {
    return Object.values(PLANS).map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      monthlyPriceUsd: p.monthlyPriceUsd,
      maxProjects: p.maxProjects,
      maxUsers: p.maxUsers,
      features: p.features,
      stripeConfigured: !!p.stripePriceId && !this.mockMode,
    }));
  }

  async createCheckoutSession(
    organizationId: string,
    userId: string,
    planId: PlanId,
  ) {
    if (planId === 'trial') {
      throw new BadRequestException('Trial is automatic on registration');
    }
    const plan = PLANS[planId];
    const org = await this.orgModel.findById(organizationId);
    const user = await this.userModel.findById(userId);
    if (!org || !user) {
      throw new BadRequestException('Organisation or user not found');
    }

    const frontend = this.config.get('FRONTEND_URL', 'http://localhost:4200');

    if (this.mockMode) {
      await this.organizationsService.activateSubscription(organizationId, {
        planId,
        stripeCustomerId: `mock_cus_${organizationId}`,
        stripeSubscriptionId: `mock_sub_${planId}_${Date.now()}`,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      return {
        mock: true,
        url: `${frontend}/settings/billing?success=1&plan=${planId}`,
      };
    }

    if (!this.stripe || !plan.stripePriceId) {
      throw new BadRequestException('Stripe is not configured for checkout');
    }

    let customerId = org.stripeCustomerId;
    if (!customerId) {
      const customer = await this.stripe.customers.create({
        email: user.email,
        name: org.name,
        metadata: { organizationId },
      });
      customerId = customer.id;
      org.stripeCustomerId = customerId;
      await org.save();
    }

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: plan.stripePriceId, quantity: 1 }],
      success_url: `${frontend}/settings/billing?success=1&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontend}/settings/billing?canceled=1`,
      metadata: { organizationId, planId },
      subscription_data: {
        metadata: { organizationId, planId },
      },
    });

    return { url: session.url, sessionId: session.id };
  }

  async createPortalSession(organizationId: string) {
    const org = await this.orgModel.findById(organizationId);
    if (!org?.stripeCustomerId) {
      throw new BadRequestException('No billing account yet. Subscribe to a plan first.');
    }
    const frontend = this.config.get('FRONTEND_URL', 'http://localhost:4200');

    if (this.mockMode) {
      return { url: `${frontend}/settings/billing`, mock: true };
    }

    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured for billing portal');
    }

    const session = await this.stripe.billingPortal.sessions.create({
      customer: org.stripeCustomerId,
      return_url: `${frontend}/settings/billing`,
    });
    return { url: session.url };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    if (this.mockMode) {
      return { received: true, mock: true };
    }
    if (!this.stripe) {
      throw new BadRequestException('Stripe is not configured for webhook handling');
    }
    const secret = this.config.get<string>('STRIPE_WEBHOOK_SECRET');
    if (!secret) {
      throw new BadRequestException('Webhook secret not configured');
    }

    const event = this.stripe.webhooks.constructEvent(rawBody, signature, secret);

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as {
          metadata?: Record<string, string>;
          subscription?: string | { id: string };
          customer?: string;
        };
        const orgId = session.metadata?.organizationId;
        const planId = session.metadata?.planId as PlanId | undefined;
        if (orgId && planId && session.subscription) {
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;
          await this.organizationsService.activateSubscription(orgId, {
            planId,
            stripeCustomerId: session.customer as string,
            stripeSubscriptionId: subId,
          });
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as {
          metadata?: Record<string, string>;
          status?: string;
          current_period_end?: number;
        };
        const orgId = sub.metadata?.organizationId;
        if (orgId) {
          const planId = (sub.metadata?.planId as PlanId) ?? 'starter';
          const status =
            sub.status === 'active'
              ? 'active'
              : sub.status === 'trialing'
                ? 'trialing'
                : sub.status === 'past_due'
                  ? 'past_due'
                  : 'canceled';
          await this.organizationsService.updateSubscriptionStatus(orgId, status, planId);
          if (sub.current_period_end) {
            await this.orgModel.findByIdAndUpdate(orgId, {
              currentPeriodEnd: new Date(sub.current_period_end * 1000),
            });
          }
        }
        break;
      }
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as {
          subscription?: string;
          metadata?: Record<string, string>;
          status?: string;
          customer?: string;
          current_period_end?: number;
        };
        const orgId = invoice.metadata?.organizationId;
        if (orgId && invoice.subscription) {
          await this.organizationsService.updateSubscriptionStatus(orgId, 'active', invoice.metadata?.planId as PlanId);
          if (invoice.current_period_end) {
            await this.orgModel.findByIdAndUpdate(orgId, {
              currentPeriodEnd: new Date(invoice.current_period_end * 1000),
            });
          }
        }
        break;
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object as {
          subscription?: string;
          metadata?: Record<string, string>;
          status?: string;
          customer?: string;
          current_period_end?: number;
        };
        const orgId = invoice.metadata?.organizationId;
        if (orgId) {
          await this.organizationsService.updateSubscriptionStatus(orgId, 'past_due', invoice.metadata?.planId as PlanId);
        }
        break;
      }
      default:
        break;
    }

    return { received: true };
  }

  async getBillingStatus(organizationId: string) {
    const org = await this.orgModel.findById(organizationId).lean();
    if (!org) {
      throw new BadRequestException('Organisation not found');
    }
    const plan = PLANS[org.planId as PlanId] ?? PLANS.trial;
    return {
      planId: org.planId,
      planName: plan.name,
      subscriptionStatus: org.subscriptionStatus,
      trialEndsAt: org.trialEndsAt,
      currentPeriodEnd: org.currentPeriodEnd,
      stripeConfigured: !this.mockMode,
      mockMode: this.mockMode,
    };
  }
}
