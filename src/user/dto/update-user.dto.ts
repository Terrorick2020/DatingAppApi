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

export class UpdateUserDto {
	@ApiProperty({
		description: 'Telegram ID пользователя',
		example: '123456789',
	})
	@IsString()
	@IsNotEmpty()
	telegramId: string

	@ApiProperty({
		description: 'Имя пользователя',
		example: 'Иван',
	})
	@IsString()
	@IsNotEmpty()
	@IsOptional()
	name?: string

	@ApiProperty({
		description: 'Город пользователя',
		example: 'Москва',
	})
	@IsString()
	@IsNotEmpty()
	@IsOptional()
	town?: string

	@ApiProperty({
		description: 'Пол пользователя',
		enum: Sex,
		example: 'Male',
	})
	@IsEnum(Sex)
	@IsOptional()
	sex?: Sex

	@ApiProperty({
		description: 'Искомы пол',
		enum: Sex,
		example: 'Female',
	})
	@IsEnum(Sex)
	@IsOptional()
	selSex?: Sex

	@ApiProperty({
		description: 'Возраст пользователя',
		example: 25,
		minimum: 18,
		maximum: 100,
	})
	@IsNumber()
	@Min(18)
	@Max(100)
	@Transform(({ value }) => value !== undefined ? parseInt(value, 10) : undefined)
	@IsOptional()
	age?: number

	@ApiProperty({
		description: 'Биография пользователя',
		example: 'Люблю путешествовать и фотографировать',
	})
	@IsString()
	@IsNotEmpty()
	@IsOptional()
	bio?: string

	@ApiProperty({
		description: 'Включить геолокацию',
		example: false,
	})
	@IsBoolean()
	@Transform(({ value }) => value === 'true' || value === true)
	@IsGeoDataValid()
	@IsOptional()
	enableGeo?: boolean

	@ApiPropertyOptional({
		description: 'Широта (обязательно если enableGeo = true)',
		example: 55.7558,
		minimum: -90,
		maximum: 90,
	})
	@IsOptional()
	@IsNumber()
	@Min(-90)
	@Max(90)
	@Transform(({ value }) => (value ? parseFloat(value) : undefined))
	latitude?: number

	@ApiPropertyOptional({
		description: 'Долгота (обязательно если enableGeo = true)',
		example: 37.6176,
		minimum: -180,
		maximum: 180,
	})
	@IsOptional()
	@IsNumber()
	@Min(-180)
	@Max(180)
	@Transform(({ value }) => (value ? parseFloat(value) : undefined))
	longitude?: number

	@ApiProperty({
		description: 'Язык пользователя',
		default: 'ru',
		example: 'ru',
	})
	@IsString()
	@IsNotEmpty()
	@IsOptional()
	lang?: string

	@ApiProperty({
		description: 'ID загруженных фотографий',
		type: [Number],
		example: [1, 2, 3],
	})
	@IsArray()
	@ArrayMinSize(1)
	@Transform(({ value }) => (Array.isArray(value) ? value : [value]))
	@IsOptional()
	photoIds?: number[]

	@ApiProperty({
		description: 'ID интереса пользователя',
		example: 1,
	})
	@IsNumber()
	@Transform(({ value }) => value !== undefined ? parseInt(value, 10) : undefined)
	@IsOptional()
	interestId?: number | null

	@ApiPropertyOptional({
		description: 'Реферальный код пригласившего пользователя',
		example: 'abcd1234', 
	})
	@IsOptional()
	@IsString()
	@IsValidReferralCode({
		message: 'Указан недействительный реферальный код',
	})
	invitedByReferralCode?: string
}
