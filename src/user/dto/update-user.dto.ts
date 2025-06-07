import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsValidReferralCode } from '../../auth/refferal-code.validator'
import {
	IsString,
	IsNumber,
	IsEnum,
	IsBoolean,
	IsArray,
	IsOptional,
	IsNotEmpty,
	ArrayMinSize,
	Min,
	Max,
} from 'class-validator'
import { Transform } from 'class-transformer'
import { Sex } from '@prisma/client'
import { IsGeoDataValid } from '~/src/geo/validators/geo-validation.validator'

type photo = {
	key: string
	url: string
}
export class UpdateUserDto {
	@IsString()
	telegramId?: string

	@ApiPropertyOptional()
	@IsString()
	name?: string

	@ApiPropertyOptional()
	@IsString()
	town?: string

	@ApiPropertyOptional()
	@IsEnum(Sex)
	sex?: Sex

	@ApiPropertyOptional()
	@IsEnum(Sex)
	selSex?: Sex

	@ApiPropertyOptional()
	@IsNumber()
	@Min(18)
	@Max(100)
	@Transform(({ value }) => parseInt(value, 10))
	age?: number

	@ApiPropertyOptional()
	@IsString()
	bio?: string

	@ApiPropertyOptional()
	@IsBoolean()
	@Transform(({ value }) => value === 'true' || value === true)
	enableGeo?: boolean

	@ApiPropertyOptional()
	@IsNumber()
	@Min(-90)
	@Max(90)
	latitude?: number

	@ApiPropertyOptional()
	@IsNumber()
	@Min(-180)
	@Max(180)
	longitude?: number

	@ApiPropertyOptional()
	@IsString()
	lang?: string

	@ApiPropertyOptional()
	@IsArray()
	@ArrayMinSize(1)
	@Transform(({ value }) => (Array.isArray(value) ? value : [value]))
	photoIds?: number[]

	@ApiPropertyOptional()
	@IsNumber()
	interestId?: number | null

	@ApiPropertyOptional()
	@IsString()
	@IsValidReferralCode({
		message: 'Указан недействительный реферальный код',
	})
	invitedByReferralCode?: string

	photos?: photo[]
}
