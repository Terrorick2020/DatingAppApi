import { IsString, IsNumber, IsEnum, IsBoolean, IsArray } from 'class-validator'
import { Sex, Request } from '@prisma/client'

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

  @IsArray()
  @IsNumber({}, { each: true })  
  photoIds!: number[]           
}
