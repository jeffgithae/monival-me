import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios from 'axios';
import * as crypto from 'crypto';
import { PlanId, PLANS } from '../common/constants/plans';
import { Organization } from '../organizations/schemas/organization.schema';
import { OrganizationsService } from '../organizations/organizations.service';
import { User } from '../users/schemas/user.schema';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private readonly paystackSecret: string;
  private readonly mockMode: boolean;

  constructor(
    private readonly config: ConfigService,
    @InjectModel(Organization.name) private readonly orgModel: Model<Organization>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly organizationsService: OrganizationsService,
    private readonly mailer: MailerService,
  ) {
    this.paystackSecret = this.config.get<string>('PAYSTACK_SECRET_KEY') || '';
    const forceMock = this.config.get('BILLING_MOCK') === 'true';
    this.mockMode = forceMock || !this.paystackSecret;
    if (this.mockMode) {
      this.logger.warn(
        'Paystack is not configured or BILLING_MOCK=true. Billing endpoints will run in mock mode.',
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
      paystackConfigured: !!p.paystackPlanCode && !this.mockMode,
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
        paystackCustomerCode: `mock_cus_${organizationId}`,
        paystackSubscriptionCode: `mock_sub_${planId}_${Date.now()}`,
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      return {
        mock: true,
        url: `${frontend}/settings/billing?success=1&plan=${planId}`,
      };
    }

    if (!this.paystackSecret || !plan.paystackPlanCode) {
      throw new BadRequestException('Paystack is not configured for checkout for this plan');
    }

    // Initialize Paystack transaction
    try {
      const response = await axios.post(
        'https://api.paystack.co/transaction/initialize',
        {
          email: user.email,
          amount: plan.monthlyPriceUsd * 100, // amount in kobo/cents
          plan: plan.paystackPlanCode,
          callback_url: `${frontend}/settings/billing?success=1`,
          metadata: {
            custom_fields: [
              {
                display_name: "Organization ID",
                variable_name: "organizationId",
                value: organizationId
              },
              {
                display_name: "Plan ID",
                variable_name: "planId",
                value: planId
              }
            ]
          }
        },
        {
          headers: {
            Authorization: `Bearer ${this.paystackSecret}`,
            'Content-Type': 'application/json',
          },
        },
      );

      return { url: response.data.data.authorization_url, sessionId: response.data.data.reference };
    } catch (error) {
      this.logger.error('Failed to initialize Paystack transaction', error);
      throw new BadRequestException('Failed to initiate payment');
    }
  }

  async createPortalSession(organizationId: string) {
    const org = await this.orgModel.findById(organizationId);
    if (!org?.paystackCustomerCode && !org?.stripeCustomerId) {
      throw new BadRequestException('No billing account yet. Subscribe to a plan first.');
    }
    const frontend = this.config.get('FRONTEND_URL', 'http://localhost:4200');

    if (this.mockMode) {
      return { url: `${frontend}/settings/billing`, mock: true };
    }

    // Paystack does not have a hosted billing portal like Stripe.
    // Return to the billing page where the user can manage it natively via APIs if implemented.
    return { url: `${frontend}/settings/billing?portal=unsupported` };
  }

  async handleWebhook(rawBody: Buffer, signature: string) {
    if (this.mockMode) {
      return { received: true, mock: true };
    }
    if (!this.paystackSecret) {
      throw new BadRequestException('Paystack is not configured for webhook handling');
    }

    // Verify Paystack signature
    const hash = crypto
      .createHmac('sha512', this.paystackSecret)
      .update(rawBody)
      .digest('hex');

    if (hash !== signature) {
      throw new BadRequestException('Invalid webhook signature');
    }

    let event;
    try {
      event = JSON.parse(rawBody.toString());
    } catch (err) {
      throw new BadRequestException('Invalid webhook payload');
    }

    const eventData = event.data;

    switch (event.event) {
      case 'charge.success': {
        const metadata = eventData.metadata;
        // Extract from custom_fields
        const orgField = metadata?.custom_fields?.find((f: any) => f.variable_name === 'organizationId');
        const planField = metadata?.custom_fields?.find((f: any) => f.variable_name === 'planId');
        
        const orgId = orgField?.value;
        const planId = planField?.value as PlanId | undefined;

        if (orgId && planId) {
          await this.organizationsService.activateSubscription(orgId, {
            planId,
            paystackCustomerCode: eventData.customer?.customer_code,
            // Paystack might not provide subscription code immediately in charge.success
            // It will be sent in subscription.create, or we can just mark it active for now.
          });
          
          // Send invoice email
          const org = await this.orgModel.findById(orgId);
          const owner = await this.userModel.findOne({ organizationId: new Types.ObjectId(orgId) }).sort({ createdAt: 1 });
          if (org && owner) {
            const amount = `$${(eventData.amount / 100).toFixed(2)}`;
            const invoiceNumber = eventData.reference || 'N/A';
            const body = this.mailer.invoiceEmail({
              name: owner.name,
              amount,
              invoiceNumber,
              downloadUrl: '#', // Paystack receipt URL is sent to customer email by default
            });
            await this.mailer.send({
              to: owner.email,
              subject: `Payment Receipt - ${invoiceNumber}`,
              ...body,
            });
          }
        }
        break;
      }
      
      case 'subscription.create': {
        const customerCode = eventData.customer?.customer_code;
        const subscriptionCode = eventData.subscription_code;
        if (customerCode && subscriptionCode) {
          // Find the org by customer code and update the subscription code
          const org = await this.orgModel.findOne({ paystackCustomerCode: customerCode });
          if (org) {
            await this.orgModel.findByIdAndUpdate(org._id, {
              paystackSubscriptionCode: subscriptionCode,
              currentPeriodEnd: new Date(eventData.next_payment_date),
            });
          }
        }
        break;
      }

      case 'subscription.disable':
      case 'subscription.not_renew': {
        const customerCode = eventData.customer?.customer_code;
        if (customerCode) {
          const org = await this.orgModel.findOne({ paystackCustomerCode: customerCode });
          if (org) {
            await this.organizationsService.updateSubscriptionStatus(org._id.toString(), 'canceled');
          }
        }
        break;
      }

      case 'charge.failed':
      case 'invoice.payment_failed': {
        const customerCode = eventData.customer?.customer_code;
        if (customerCode) {
          const org = await this.orgModel.findOne({ paystackCustomerCode: customerCode });
          if (org) {
            await this.organizationsService.updateSubscriptionStatus(org._id.toString(), 'past_due');
            
            const owner = await this.userModel.findOne({ organizationId: org._id }).sort({ createdAt: 1 });
            if (owner) {
              const amount = `$${(eventData.amount / 100).toFixed(2)}`;
              const dueDate = new Date().toLocaleDateString();
              const body = this.mailer.paymentReminderEmail({
                name: owner.name,
                amount,
                dueDate,
                paymentUrl: '#', 
              });
              await this.mailer.send({
                to: owner.email,
                subject: `Payment Reminder - Action Required`,
                ...body,
              });
            }
          }
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
      paystackConfigured: !this.mockMode,
      mockMode: this.mockMode,
    };
  }
}
