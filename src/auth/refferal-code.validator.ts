import {
	registerDecorator,
	ValidationOptions,
	ValidationArguments,
} from 'class-validator'
import { PrismaService } from '@/../prisma/prisma.service'

export function IsValidReferralCode(validationOptions?: ValidationOptions) {
	return function (object: Object, propertyName: string) {
		registerDecorator({
			name: 'isValidReferralCode',
			target: object.constructor,
			propertyName: propertyName,
			options: validationOptions,
			validator: {
				async validate(value: any, args: ValidationArguments) {
					if (!value) return true // Пропускаем, если код не указан

					// Получаем доступ к PrismaService через контекст
					const prisma = (global as any).prismaInstance as PrismaService
					if (!prisma) return false // Если не удалось получить Prisma

					// Проверка формата (8 символов, буквы и цифры)
					const formatRegex = /^[a-zA-Z0-9]{8}$/
					if (!formatRegex.test(value)) return false

					// Проверка существования пользователя с таким кодом
					const user = await prisma.user.findUnique({
						where: { referralCode: value },
						select: { telegramId: true, status: true },
					})

					// Код действителен, если пользователь существует и не заблокирован
					return !!user && user.status !== 'Blocked'
				},
				defaultMessage(args: ValidationArguments) {
					return `Реферальный код недействителен или принадлежит заблокированному пользователю`
				},
			},
		})
	}
}
