import { Sex } from '@prisma/client'

export class PublicUserDto {
	id!: number
	name!: string
	town!: string
	age!: number
	sex!: Sex
	photos!: string[]
}
