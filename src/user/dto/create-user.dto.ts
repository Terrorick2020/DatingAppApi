import {
  IsString,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsArray,
  IsOptional,
} from 'class-validator'
import { Sex } from '@prisma/client'

export class CreateUserDto {
  @IsString()
  telegramId!: string

  @IsString()
  name!: string
 
  @IsString()
  town!: string

  @IsEnum(Sex)
  sex!: Sex

  @IsEnum(Sex)
  selSex!: Sex

  @IsNumber()
  age!: number

  @IsString()
  bio!: string

  @IsString()
  lang!: string

  @IsBoolean()
  enableGeo!: boolean

  @IsNumber()
  interestId!: number

  @IsArray()
  @IsNumber({}, { each: true })
  photoIds!: number[]

  @IsOptional()
  @IsString()
  invitedByReferralCode?: string
}
