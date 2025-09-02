import { Test, TestingModule } from '@nestjs/testing'
import { PrismaService } from '../../prisma/prisma.service'
import {
	createPrismaClientMock,
	PrismaServiceMock,
} from '../../test/mock/prisma.service.mock'
import { UserService } from '../user/user.service'
import { UserServiceMock } from '../../test/mock/user.service.mock'
import { AuthService } from './auth.service'
import { Sex, Role, Status } from '@prisma/client'

describe('AuthService', () => {
	let service: AuthService
	let prisma: PrismaService
	let userService: UserService

	const telegramId = 'telegram_test_id'
	const mockPhotoIds = [1, 2]

	const baseDto = {
		telegramId,
		name: 'Alice',
		town: 'Wonderland',
		sex: Sex.Female,
		selSex: Sex.Male,
		age: 21,
		bio: 'Explorer',
		lang: 'ru',
		enableGeo: true,
		role: Role.User,
		status: Status.Noob,
		interestId: 1,
		photoIds: mockPhotoIds,
	}

	beforeEach(async () => {
		const module: TestingModule = await Test.createTestingModule({
			providers: [
				AuthService,
				{ provide: PrismaService, useValue: PrismaServiceMock },
				{ provide: UserService, useClass: UserServiceMock },
			],
		}).compile()

		service = module.get<AuthService>(AuthService)
		prisma = module.get<PrismaService>(PrismaService)
		userService = module.get<UserService>(UserService)

		jest.clearAllMocks()
	})

	it('should be defined', () => {
		expect(service).toBeDefined()
	})

	describe('check', () => {
		it('should return status Pro if user exists', async () => {
			const result = await service.check({ telegramId })
			expect(result.data).toBe('Pro')
		})

		it('should return None if user does not exist', async () => {
			const result = await service.check({ telegramId: 'non_existing' })
			expect(result.data).toBe('None')
		})
	})

	describe('uploadPhoto', () => {
		it('should create photo and return id', async () => {
			const result = await service.uploadPhoto({
				telegramId,
				key: 'test_photo_key',
			})

			expect(result.message).toBe('Фото временно сохранено')
			expect(result.data).toHaveProperty('photoId')
		})
	})

	describe('register', () => {
		it('should register user if valid and not exists', async () => {
			const result = await service.register(baseDto)
			expect(result.message).toBe('Пользователь создан и фото привязаны')
		})

		it('should return error if user already exists', async () => {
			jest
				.spyOn(prisma.user, 'findUnique')
				.mockReturnValueOnce(Promise.resolve({ id: 1 }) as any)

			const result = await service.register(baseDto)
			expect(result.message).toContain('Пользователь уже существует')
		})

		it('should return error if some photos are not found', async () => {
			jest
				.spyOn(prisma.user, 'findUnique')
				.mockImplementation(() => createPrismaClientMock(null))

			jest
				.spyOn(prisma.photo, 'findMany')
				.mockResolvedValueOnce([{ id: 1 }] as any)

			const result = await service.register(baseDto)
			expect(result.message).toContain('Некоторые фотографии не найдены')
		})

		it('should handle invitedByReferralCode if provided', async () => {
			const findUniqueMock = jest
				.spyOn(prisma.user, 'findUnique')
				.mockImplementation((args: any) => {
					if ('telegramId' in args.where) {
						return createPrismaClientMock(null)
					}
					if ('referralCode' in args.where) {
						return createPrismaClientMock({ id: 99 } as any)
					}
					return createPrismaClientMock(null)
				})

			await service.register({ ...baseDto, invitedByReferralCode: 'ABC123' })

			expect(findUniqueMock).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { telegramId },
				})
			)
			expect(findUniqueMock).toHaveBeenCalledWith(
				expect.objectContaining({
					where: { referralCode: 'ABC123' },
				})
			)
		})
	})
})
