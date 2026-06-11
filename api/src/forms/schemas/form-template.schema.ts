import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema, SchemaTypes, Types } from 'mongoose';

export type FormTemplateDocument = HydratedDocument<FormTemplate>;

const FormQuestionSchema = new MongooseSchema(
    {
        key: { type: String, required: true, trim: true },
        label: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        type: {
            type: String,
            enum: ['text', 'textarea', 'number', 'select', 'radio', 'checkbox', 'date', 'boolean'],
            default: 'text',
        },
        required: { type: Boolean, default: false },
        options: [{ type: String, trim: true }],
        validation: {
            min: Number,
            max: Number,
            pattern: String,
            patternMessage: String,
        },
        conditional: {
            dependsOn: String,
            operator: { type: String, enum: ['equals', 'not_equals', 'in', 'not_in'], default: 'equals' },
            value: SchemaTypes.Mixed,
        },
        repeatGroup: { type: Boolean, default: false },
    },
    { _id: false },
);

const FormSectionSchema = new MongooseSchema(
    {
        title: { type: String, required: true, trim: true },
        description: { type: String, trim: true },
        questions: { type: [FormQuestionSchema], default: [] },
        repeatGroup: { type: Boolean, default: false },
    },
    { _id: false },
);

@Schema({ timestamps: true })
export class FormTemplate {
    @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
    organizationId!: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Project', index: true })
    projectId?: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'Indicator', index: true })
    indicatorId?: Types.ObjectId;

    @Prop({ required: true, trim: true })
    name!: string;

    @Prop({ trim: true })
    description?: string;

    @Prop({ type: String, enum: ['draft', 'active'], default: 'draft' })
    status!: string;

    @Prop({ type: [FormSectionSchema], default: [] })
    sections!: Array<Record<string, unknown>>;
}

export const FormTemplateSchema = SchemaFactory.createForClass(FormTemplate);
export { FormSectionSchema, FormQuestionSchema };

// ─── Indexes ──────────────────────────────────────────────────────────────────
FormTemplateSchema.index({ organizationId: 1, status: 1 });
FormTemplateSchema.index({ organizationId: 1, projectId: 1 });