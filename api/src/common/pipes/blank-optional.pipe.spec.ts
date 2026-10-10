import { Type } from 'class-transformer';
import { IsDateString, IsIn, IsMongoId, IsOptional, IsString, ValidateNested } from 'class-validator';
import { BlankOptionalPipe } from './blank-optional.pipe';

class ChildDto {
  @IsOptional() @IsMongoId() ownerId?: string;
  @IsString() label!: string;
}

class ParentDto {
  @IsString() name!: string;
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsIn(['a', 'b']) kind?: string;
  @IsDateString() startDate!: string;
  @IsOptional() @ValidateNested({ each: true }) @Type(() => ChildDto) children?: ChildDto[];
}

describe('BlankOptionalPipe', () => {
  const run = (value: unknown, type: 'body' | 'query' | 'param' = 'body') =>
    new BlankOptionalPipe().transform(value, { type, metatype: ParentDto });

  it('drops blank optional fields that have a typed rule', () => {
    expect(run({ name: 'x', startDate: '2026-01-01', dueDate: '', kind: '' })).toEqual({
      name: 'x', startDate: '2026-01-01',
    });
  });

  it('keeps a blank optional plain string, so text can still be cleared', () => {
    expect(run({ name: 'x', startDate: '2026-01-01', notes: '' })).toMatchObject({ notes: '' });
  });

  it('keeps a blank required field so validation still reports it', () => {
    expect(run({ name: 'x', startDate: '' })).toMatchObject({ startDate: '' });
  });

  it('recurses into nested DTOs', () => {
    expect(run({ name: 'x', startDate: '2026-01-01', children: [{ ownerId: '', label: 'c' }] })).toEqual({
      name: 'x', startDate: '2026-01-01', children: [{ label: 'c' }],
    });
  });

  it('leaves non-body arguments and populated values alone', () => {
    expect(run({ dueDate: '' }, 'param')).toEqual({ dueDate: '' });
    expect(run({ name: 'x', startDate: '2026-01-01', dueDate: '2026-02-01' })).toMatchObject({ dueDate: '2026-02-01' });
  });
});
