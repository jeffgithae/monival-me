import { PartialType } from '@nestjs/mapped-types';
import { CreateActivityTemplateDto } from './create-activity-template.dto';

export class UpdateActivityTemplateDto extends PartialType(CreateActivityTemplateDto) {}
