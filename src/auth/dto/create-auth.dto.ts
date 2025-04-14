import {
	IsString,
	IsNumber,
	IsOptional,
	IsEnum,
	IsBoolean,
	IsArray,
} from 'class-validator'
import { Sex, Request, Role, Status } from '@prisma/client'

export class CreateAuthDto {
	@IsString()
	telegramId!: string

	@IsString()
	name!: string

	@IsString()
	town!: string

	@IsEnum(Sex)
	sex!: Sex

	@IsNumber()
	age!: number

	@IsString()
	bio!: string

	@IsString()
	lang!: string

	@IsBoolean()
	geo!: boolean

	@IsEnum(Request)
	findRequest!: Request

	@IsEnum(Role)
	@IsOptional()
	role?: Role = Role.User

	@IsEnum(Status)
	@IsOptional()
	status?: Status = Status.None

	@IsOptional()
	@IsArray()
	@IsString({ each: true })
	photoIds?: string[]
}
