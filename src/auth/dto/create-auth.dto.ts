import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsValidReferralCode } from '../refferal-code.validator'
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

export class CreateAuthDto {
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
	name: string

	@ApiProperty({
		description: 'Город пользователя',
		example: 'Москва',
	})
	@IsString()
	@IsNotEmpty()
	town: string

	@ApiProperty({
		description: 'Пол пользователя',
		enum: Sex,
		example: 'Male',
	})
	@IsEnum(Sex)
	sex: Sex

	@ApiProperty({
		description: 'Возраст пользователя',
		example: 25,
		minimum: 18,
		maximum: 100,
	})
	@IsNumber()
	@Min(18)
	@Max(100)
	@Transform(({ value }) => parseInt(value, 10))
	age: number

	@ApiProperty({
		description: 'Биография пользователя',
		example: 'Люблю путешествовать и фотографировать',
	})
	@IsString()
	@IsNotEmpty()
	bio: string

	@ApiProperty({
		description: 'Включить геолокацию',
		example: false,
	})
	@IsBoolean()
	@Transform(({ value }) => value === 'true' || value === true)
	enableGeo: boolean

	@ApiProperty({
		description: 'Язык пользователя',
		default: 'ru',
		example: 'ru',
	})
	@IsString()
	@IsNotEmpty()
	lang: string

	@ApiProperty({
		description: 'ID загруженных фотографий',
		type: [Number],
		example: [1, 2, 3],
	})
	@IsArray()
	@ArrayMinSize(1)
	@Transform(({ value }) => (Array.isArray(value) ? value : [value]))
	photoIds: number[]

	@ApiProperty({
		description: 'ID интереса пользователя',
		example: 1,
	})
	@IsNumber()
	@Transform(({ value }) => parseInt(value, 10))
	interestId: number

	@ApiPropertyOptional({
		description: 'Реферальный код пригласившего пользователя',
		example: 'abcd1234',
	})
	@ApiPropertyOptional({
		description: 'Реферальный код пригласившего пользователя',
		example: 'abcd1234',
		maxLength: 8,
		minLength: 8,
	})
	@IsOptional()
	@IsString()
	@IsValidReferralCode({
		message: 'Указан недействительный реферальный код',
	})
	invitedByReferralCode?: string
}
