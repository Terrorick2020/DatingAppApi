import { IsString, IsNumber } from 'class-validator'


export class SetSelfDto {
    @IsString()
    telegramId!: string

    @IsNumber()
    planId!: number

    @IsString()
    planDescription!: string

    @IsNumber()
    regionId!: number

    @IsString()
    regionnDescription!: string
}
