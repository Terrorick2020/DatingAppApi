import { Injectable } from '@nestjs/common'
import { CreateAuthDto } from './dto/create-auth.dto'
import { UpdateAuthDto } from './dto/update-auth.dto'
import { PrismaService } from '~/prisma/prisma.service'
import * as crypto from 'crypto'

@Injectable()
export class AuthService {
	constructor(private prisma: PrismaService) {}

	create(createAuthDto: any) {
		console.log(this.verifyTelegramAuth(createAuthDto))
		return createAuthDto
	}

	verifyTelegramAuth(data: any): boolean {
		const { hash, ...dataWithoutHash } = data
		const token = process.env.BOT_TOKEN || ''
		const secretKey = crypto
			.createHmac('sha256', 'WebAppData')
			.update(token)
			.digest()

		const checkString = Object.keys(dataWithoutHash)
			.sort()
			.map(key => `${key}=${dataWithoutHash[key]}`)
			.join('\n')

		const calculatedHash = crypto
			.createHmac('sha256', secretKey)
			.update(checkString)
			.digest('hex')

		return calculatedHash === hash
	}

	findAll() {
		return `This action returns all auth`
	}

	findOne(id: number) {
		return `This action returns a #${id} auth`
	}

	update(id: number, updateAuthDto: UpdateAuthDto) {
		return `This action updates a #${id} auth`
	}

	remove(id: number) {
		return `This action removes a #${id} auth`
	}
}
