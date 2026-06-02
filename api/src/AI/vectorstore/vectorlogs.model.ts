import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { ApiProperty } from '@nestjs/swagger';
import { User } from '@Sibasi/core/user/models/user.model';
import { IsArray, IsDate, IsMongoId, IsString } from 'class-validator';
import { Document, SchemaTypes, Types } from 'mongoose';

@Schema({
    timestamps: true,
})
export class SibasiVectorLogs extends Document {
    @Prop({ type: SchemaTypes.String })
    userPrompt: string;

    @Prop({ type: SchemaTypes.ObjectId })
    organization: Types.ObjectId;

    @Prop({ type: SchemaTypes.ObjectId, ref: User.name })
    user: Types.ObjectId;

    @Prop({ type: SchemaTypes.String })
    aiResponse: string;

    @Prop({ type: SchemaTypes.String })
    timeCreated: Date;

    @Prop({ type: SchemaTypes.String })
    timeofResponse: Date;

    @Prop({ type: [SchemaTypes.ObjectId] })
    fileIds: Types.ObjectId[];
}
export const SibasiVectorLogsSchema = SchemaFactory.createForClass(SibasiVectorLogs);
SibasiVectorLogsSchema.index({ '$**': 'text' });

export class SibasiVectorLogsDTO {
    @IsString()
    userPrompt: string;
    @IsMongoId()
    organization: Types.ObjectId;
    @IsMongoId()
    user: Types.ObjectId;
    @IsString()
    aiResponse: string;
    @IsDate()
    timeCreated: Date;
    @IsDate()
    timeofResponse: Date;
    @IsArray()
    fileIds: Types.ObjectId[];
}
