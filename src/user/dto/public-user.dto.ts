import { Sex } from '@prisma/client'


type photo = {
	key: string,
	url: string
}
export class PublicUserDto {
	telegramId!: string
	name!: string
	town!: string
	age!: number
	sex!: Sex
	photos!: photo[]
}
