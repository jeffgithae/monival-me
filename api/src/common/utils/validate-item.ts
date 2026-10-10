import { BadRequestException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

function dropBlanks(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(dropBlanks);
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    const out: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      if (v === '' || v === null || v === undefined) continue;
      out[key] = dropBlanks(v);
    }
    return out;
  }
  return value;
}

function messages(errors: ValidationError[], path = ''): string[] {
  return errors.flatMap((e) => [
    ...Object.values(e.constraints ?? {}).map((m) => (path ? `${path}${m}` : m)),
    ...messages(e.children ?? [], `${path}${e.property}.`),
  ]);
}

/**
 * Validates one record of a batch against its DTO, the way the global
 * ValidationPipe does for a single-record request.
 *
 * Batch endpoints (bulk create, offline sync) take `{ items: [...] }`, and the
 * pipe does not look inside that array — so each record used to reach the
 * service unchecked and unstripped. Run per record rather than on the whole
 * body so one bad record is reported against itself and the rest still sync.
 * Blank values are treated as absent, as a form that was never filled in.
 */
export async function validatedItem<T extends object>(dto: new () => T, raw: unknown): Promise<T> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new BadRequestException('Each record must be an object');
  }
  const instance = plainToInstance(dto, dropBlanks(raw));
  const errors = await validate(instance, { whitelist: true, forbidUnknownValues: false });
  if (errors.length) {
    throw new BadRequestException(messages(errors).join('; ') || 'Invalid record');
  }
  return instance;
}
