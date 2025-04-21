import { IsString, IsOptional, IsNumber } from 'class-validator'

export class SetKeyDto {
	@IsString()
	key!: string

	@IsString()
	value!: string

	@IsOptional()
	@IsNumber()
	ttl?: number
}
