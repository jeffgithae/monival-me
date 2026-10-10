import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsIn, IsInt, IsMongoId, IsNotEmpty,
  IsNumber, IsObject, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { WEBHOOK_EVENTS, WebhookEvent } from '../../webhooks/schemas/webhook.schema';
import { FeedbackStatus } from '../../stakeholder-feedback/schemas/stakeholder-feedback.schema';

/**
 * Validated request bodies for endpoints that used to declare their body as
 * an inline type or an interface. Those shapes exist only at compile time, so
 * the global ValidationPipe had nothing to check: missing fields reached the
 * services as `undefined` (500s), and — because nothing was whitelisted — a
 * caller could set any field the schema has, including `organizationId`.
 * Classes here give the pipe something to enforce and strip against.
 */

// ── Account ──────────────────────────────────────────────────────────────────

const PASSWORD_MIN = 8;

export class RegisterInvitedBody {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsString() @MinLength(PASSWORD_MIN) @MaxLength(200) password!: string;
  @IsString() @IsNotEmpty() token!: string;
}

export class VerifyMfaBody {
  @IsString() @IsNotEmpty() challengeToken!: string;
  @IsString() @IsNotEmpty() @MaxLength(32) totpCode!: string;
}

export class ForgotPasswordBody {
  @IsEmail() email!: string;
}

export class ResetPasswordBody {
  @IsString() @IsNotEmpty() token!: string;
  @IsString() @MinLength(PASSWORD_MIN) @MaxLength(200) newPassword!: string;
}

export class GoogleLoginBody {
  @IsString() @IsNotEmpty() idToken!: string;
}

export class RefreshBody {
  @IsString() @IsNotEmpty() refreshToken!: string;
}

export class UpdateProfileBody {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
}

export class ChangePasswordBody {
  @IsString() @IsNotEmpty() currentPassword!: string;
  @IsString() @MinLength(PASSWORD_MIN) @MaxLength(200) newPassword!: string;
}

export class MfaCodeBody {
  @IsString() @IsNotEmpty() @MaxLength(32) code!: string;
}

// ── Organisation settings ────────────────────────────────────────────────────

const FRAMEWORKS = ['logframe', 'bsc', 'okr'];

export class UpdateFrameworksBody {
  @IsArray() @ArrayMinSize(1) @IsIn(FRAMEWORKS, { each: true }) frameworks!: string[];
  @IsOptional() @IsIn(FRAMEWORKS) primary?: string;
}

export class CreateApiKeyBody {
  @IsString() @IsNotEmpty() @MaxLength(80) name!: string;
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) allowedIps?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(50) @IsString({ each: true }) @MaxLength(60, { each: true }) scopes?: string[];
  @IsOptional() @IsDateString() expiresAt?: string;
}

export class UpdateBrandingBody {
  @IsOptional() @IsString() @MaxLength(80) appName?: string;
  @IsOptional() @IsString() @MaxLength(2000) logoUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) faviconUrl?: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{3,8}$/, { message: 'primaryColor must be a hex colour' }) primaryColor?: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{3,8}$/, { message: 'accentColor must be a hex colour' }) accentColor?: string;
  @IsOptional() @IsString() @MaxLength(253) customDomain?: string;
  @IsOptional() @IsString() @MaxLength(500) reportFooterText?: string;
  @IsOptional() @IsBoolean() hidePoweredBy?: boolean;
  @IsOptional() @IsIn(['light', 'dark', 'system']) defaultTheme?: 'light' | 'dark' | 'system';
  @IsOptional() @IsEmail() supportEmail?: string;
  @IsOptional() @IsString() @MaxLength(2000) supportUrl?: string;
}

class SsoAttributeMappingBody {
  @IsString() @IsNotEmpty() email!: string;
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() role?: string;
}

export class UpsertSsoConfigBody {
  @IsIn(['saml', 'oidc']) protocol!: 'saml' | 'oidc';
  @IsOptional() @IsBoolean() isEnabled?: boolean;
  @IsOptional() @IsBoolean() enforced?: boolean;
  @IsOptional() @IsString() samlMetadataUrl?: string;
  @IsOptional() @IsString() samlMetadataXml?: string;
  @IsOptional() @IsString() samlEntryPoint?: string;
  @IsOptional() @IsString() samlIssuer?: string;
  @IsOptional() @IsString() samlCert?: string;
  @IsOptional() @IsString() oidcIssuer?: string;
  @IsOptional() @IsString() oidcClientId?: string;
  @IsOptional() @IsString() oidcClientSecret?: string;
  @IsOptional() @IsString() oidcDiscoveryUrl?: string;
  @IsOptional() @ValidateNested() @Type(() => SsoAttributeMappingBody) attributeMapping?: SsoAttributeMappingBody;
  @IsOptional() @IsArray() @IsString({ each: true }) allowedDomains?: string[];
  // A single sign-on user must never be provisioned as an owner by default.
  @IsOptional() @IsIn(['admin', 'me_officer', 'field_officer', 'finance', 'viewer']) defaultRole?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) enforceForDomains?: string[];
}

export class ToggleSsoEnforcementBody {
  @IsBoolean() enforce!: boolean;
}

export class SamlAcsBody {
  @IsObject() attributes!: Record<string, unknown>;
}

export class OidcCallbackBody {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() redirectUri!: string;
}

export class CreateNetworkBody {
  @IsString() @MinLength(2) @MaxLength(120) name!: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
}

export class InviteNetworkMemberBody {
  @IsString() @IsNotEmpty() organizationSlug!: string;
  @IsOptional() @IsIn(['lead', 'implementing', 'observer']) role?: 'lead' | 'implementing' | 'observer';
  @IsOptional() @IsString() @MaxLength(120) label?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) sharedIndicatorCodes?: string[];
}

export class RespondNetworkInviteBody {
  @IsBoolean() accept!: boolean;
}

export class CreateWebhookBody {
  @IsString() @IsNotEmpty() @MaxLength(120) name!: string;
  // HTTPS only, on update as well as create: payloads are signed, not encrypted.
  @IsUrl({ require_tld: false, protocols: ['https'], require_protocol: true }, { message: 'url must be an https:// address' }) url!: string;
  @IsArray() @ArrayMinSize(1) @IsIn(WEBHOOK_EVENTS as readonly string[], { each: true }) events!: WebhookEvent[];
  @IsOptional() @IsMongoId() projectId?: string;
}

export class UpdateWebhookBody extends PartialType(CreateWebhookBody) {
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Projects ─────────────────────────────────────────────────────────────────

export class ArchiveProjectBody {
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export class CloseProjectBody {
  @IsDateString() closureDate!: string;
  @IsOptional() @IsString() @MaxLength(10000) lessonsLearned?: string;
  @IsOptional() @IsString() @MaxLength(10000) evaluationSummary?: string;
}

export class DuplicateProjectBody {
  @IsString() @MinLength(2) @MaxLength(200) name!: string;
}

// ── Beneficiaries ────────────────────────────────────────────────────────────

export class ExitProgramBody {
  @IsOptional() @IsString() @MaxLength(500) exitReason?: string;
}

export class MergeBeneficiariesBody {
  @IsMongoId() primaryId!: string;
  @IsMongoId() duplicateId!: string;
}

// ── Stakeholder feedback ─────────────────────────────────────────────────────

const SEXES = ['male', 'female', 'other', 'prefer_not_to_say'];

class FeedbackMediaBody {
  @IsString() @IsNotEmpty() url!: string;
  @IsOptional() @IsIn(['image', 'video', 'audio', 'document']) type?: string;
  @IsOptional() @IsString() @MaxLength(300) caption?: string;
}

export class CreateFeedbackBody {
  @IsOptional() @IsMongoId() projectId?: string;
  @IsOptional() @IsMongoId() indicatorId?: string;
  @IsOptional() @IsMongoId() activityId?: string;
  @IsOptional() @IsMongoId() beneficiaryId?: string;
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsString() @IsNotEmpty() @MaxLength(10000) content!: string;
  @IsOptional() @IsIn(['survey', 'interview', 'focus_group_discussion', 'complaint', 'suggestion', 'sms', 'social_media', 'other']) channel?: string;
  @IsOptional() @IsIn(['very_positive', 'positive', 'neutral', 'negative', 'very_negative']) sentiment?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) sentimentScore?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) thematicTags?: string[];
  @IsOptional() @IsString() @MaxLength(200) respondentName?: string;
  @IsOptional() @IsString() @MaxLength(200) respondentContact?: string;
  @IsOptional() @IsIn(SEXES) respondentSex?: string;
  @IsOptional() @IsInt() @Min(0) @Max(130) respondentAge?: number;
  @IsOptional() @IsString() @MaxLength(300) respondentLocation?: string;
  @IsOptional() @IsBoolean() isAnonymous?: boolean;
  @IsOptional() @IsBoolean() consentToPublish?: boolean;
  @IsOptional() @IsDateString() collectedAt?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => FeedbackMediaBody) media?: FeedbackMediaBody[];
}

export class FeedbackActionBody {
  @IsIn(Object.values(FeedbackStatus)) status!: FeedbackStatus;
  @IsString() @IsNotEmpty() @MaxLength(500) action!: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

// ── Impact stories ───────────────────────────────────────────────────────────

class StoryMediaBody {
  @IsString() @IsNotEmpty() url!: string;
  @IsOptional() @IsString() @MaxLength(300) caption?: string;
  @IsOptional() @IsIn(['image', 'video', 'audio']) type?: 'image' | 'video' | 'audio';
}

export class CreateImpactStoryBody {
  @IsString() @IsNotEmpty() @MaxLength(200) title!: string;
  @IsString() @IsNotEmpty() @MaxLength(20000) narrative!: string;
  @IsOptional() @IsString() @MaxLength(500) pullQuote?: string;
  @IsOptional() @IsMongoId() projectId?: string;
  @IsOptional() @IsString() @MaxLength(200) subjectName?: string;
  @IsOptional() @IsInt() @Min(0) @Max(130) subjectAge?: number;
  @IsOptional() @IsIn(['male', 'female', 'other', 'undisclosed']) subjectSex?: string;
  @IsOptional() @IsString() @MaxLength(300) subjectLocation?: string;
  @IsOptional() @IsMongoId() beneficiaryId?: string;
  @IsOptional() @IsString() @MaxLength(2000) coverImageUrl?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => StoryMediaBody) media?: StoryMediaBody[];
  @IsOptional() @IsBoolean() consentObtained?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) consentDocumentUrl?: string;
  @IsOptional() @IsBoolean() isAnonymised?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsString() @MaxLength(120) thematicArea?: string;
  @IsOptional() @IsArray() @IsInt({ each: true }) @Min(1, { each: true }) @Max(17, { each: true }) sdgGoals?: number[];
  @IsOptional() @IsBoolean() isPubliclyVisible?: boolean;
}

export class UpdateImpactStoryBody extends PartialType(CreateImpactStoryBody) {}

export class StoryStatusBody {
  @IsIn(['draft', 'review', 'published', 'archived']) status!: string;
}

// ── AI ───────────────────────────────────────────────────────────────────────

export class SuggestIndicatorBody {
  @IsString() @IsNotEmpty() @MaxLength(300) title!: string;
  @IsString() @IsNotEmpty() @MaxLength(40) level!: string;
  @IsOptional() @IsString() @MaxLength(80) sector?: string;
  @IsOptional() @IsString() @MaxLength(80) unit?: string;
}
