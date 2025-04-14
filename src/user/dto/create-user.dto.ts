import {
	IsInt,
	IsString,
	IsEnum,
	IsBoolean,
	Min,
	Max,
	IsOptional,
} from 'class-validator'

enum Sex {
	Male = 'Male',
	Female = 'Female',
	All = 'All',
	None = 'None',
}

enum Role {
	Admin = 'Admin',
	User = 'User',
	Psych = 'Psych',
}

enum Request {
	Love = 'Love',
	Sex = 'Sex',
	Communication = 'Communication',
	Friend = 'Friend',
}

enum Status {
	Pro = 'Pro',
	Noob = 'Noob',
	None = 'None',
	Blocked = 'Blocked',
}

export class CreateUserDto {
	@IsString()
	telegramId!: string

	@IsString()
	lang!: string

	@IsString()
	name!: string

	@IsString()
	town!: string

	@IsEnum(Sex)
	sex!: Sex

	@IsInt()
	@Min(0)
	@Max(120)
	age!: number

	@IsString()
	@IsOptional()
	bio!: string

	@IsBoolean()
	geo!: boolean

	@IsBoolean()
	isVerify!: boolean

	@IsEnum(Request)
	findRequest!: Request

	@IsEnum(Role)
	role!: Role

	@IsEnum(Status)
	status!: Status
}
