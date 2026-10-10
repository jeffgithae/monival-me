import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { getMetadataStorage } from 'class-validator';

// class-transformer keeps its @Type() registry in an internal module that ships
// no typings; this is the only place nested DTO classes can be looked up.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { defaultMetadataStorage } = require('class-transformer/cjs/storage') as {
  defaultMetadataStorage: {
    findTypeMetadata(target: Function, property: string): { typeFunction?: () => unknown } | undefined;
  };
};

/**
 * Validators an empty string can never satisfy. A plain `@IsString()` field is
 * deliberately absent: there `''` is a real value (it clears the text).
 */
const NON_BLANK_RULES = new Set([
  'isDateString', 'isDate', 'isMongoId', 'isIn', 'isEnum', 'isEmail', 'isUrl',
  'isNumber', 'isInt', 'isPositive', 'min', 'max', 'isBoolean', 'isArray',
  'isUuid', 'isPhoneNumber', 'isObject', 'isISO8601', 'isNumberString',
]);

/**
 * Treats a blank value in an optional, typed field as "not provided".
 *
 * HTML forms report an untouched optional input as `''`. `@IsOptional()` only
 * skips `null`/`undefined`, so a blank optional date, dropdown, email or id
 * was validated as a real value and rejected — the user saw a 400 for a field
 * they had left empty. This runs before validation and drops exactly those
 * keys, recursing into nested DTOs.
 */
@Injectable()
export class BlankOptionalPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata) {
    const { metatype, type } = metadata;
    if ((type !== 'body' && type !== 'query') || !metatype || typeof value !== 'object' || value === null) {
      return value;
    }
    this.strip(value as Record<string, unknown>, metatype);
    return value;
  }

  private strip(obj: Record<string, unknown>, target: Function) {
    const rules = getMetadataStorage().getTargetValidationMetadatas(target, '', false, false);
    if (!rules.length) return;

    const byProperty = new Map<string, { optional: boolean; nonBlank: boolean }>();
    for (const rule of rules) {
      const entry = byProperty.get(rule.propertyName) ?? { optional: false, nonBlank: false };
      if (rule.type === 'conditionalValidation') entry.optional = true;
      if (rule.name && NON_BLANK_RULES.has(rule.name)) entry.nonBlank = true;
      byProperty.set(rule.propertyName, entry);
    }

    for (const key of Object.keys(obj)) {
      const v = obj[key];
      const rule = byProperty.get(key);
      if (v === '' && rule?.optional && rule.nonBlank) {
        delete obj[key];
        continue;
      }
      if (v && typeof v === 'object') {
        const nested = defaultMetadataStorage.findTypeMetadata(target, key)?.typeFunction?.();
        if (typeof nested !== 'function') continue;
        for (const item of Array.isArray(v) ? v : [v]) {
          if (item && typeof item === 'object') this.strip(item as Record<string, unknown>, nested);
        }
      }
    }
  }
}
