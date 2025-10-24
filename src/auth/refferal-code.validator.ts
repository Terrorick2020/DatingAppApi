import { PrismaService } from '@/../prisma/prisma.service'
import {
	registerDecorator,
	ValidationArguments,
	ValidationOptions,
} from 'class-validator'

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

					console.log(`🔍 Валидация реферального кода: ${value}`)

					// Получаем доступ к PrismaService через контекст
					const prisma = (global as any).prismaInstance as PrismaService
					if (!prisma) {
						console.log(`❌ PrismaService недоступен`)
						return false // Если не удалось получить Prisma
					}

					// Проверка формата (8 символов, буквы и цифры)
					const formatRegex = /^[a-zA-Z0-9]{8}$/
					if (!formatRegex.test(value)) {
						console.log(`❌ Неверный формат реферального кода: ${value}`)
						return false
					}

					// Проверка существования пользователя с таким кодом
					const user = await prisma.user.findUnique({
						where: { referralCode: value },
						select: { telegramId: true, status: true },
					})

					console.log(`🔍 Найден пользователь с кодом ${value}:`, user)

					// Код действителен, если пользователь существует и не заблокирован
					const isValid = !!user && user.status !== 'Blocked'
					console.log(`✅ Реферальный код ${value} валиден: ${isValid}`)

					return isValid
				},
				defaultMessage(args: ValidationArguments) {
					return `Реферальный код недействителен или принадлежит заблокированному пользователю`
				},
			},
		})
	}
}
