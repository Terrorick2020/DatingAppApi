import { Prisma } from '@prisma/client'

/**
 * Создаёт мок-объект, совместимый с Prisma__UserClient<T>,
 * чтобы избежать ошибок типов при spyOn(...).mockImplementation(...)
 */
export function createPrismaClientMock<T>(data: T): Prisma.Prisma__UserClient<T> {
  const promise = Promise.resolve(data)

  return {
    then: (...args: any[]) => promise.then(...args),
    catch: (...args: any[]) => promise.catch(...args),
    finally: (...args: any[]) => promise.finally(...args),
    [Symbol.toStringTag]: 'PrismaClientPromise',
  } as unknown as Prisma.Prisma__UserClient<T>
}