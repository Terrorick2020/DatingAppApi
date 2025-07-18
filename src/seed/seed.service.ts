import { Injectable, OnModuleInit } from '@nestjs/common'
import { complaintsGlobVars, complaintDescVars } from './data/complaints'
import { PrismaService } from '~/prisma/prisma.service'
import { plansVarsList } from './data/plans'
import { interestsVarsList } from './data/interests'
import type { CityItem, RegionsItem } from './seed.type'

import cities from './data/russia-cities.json'
import regions from './data/regions.json'


@Injectable()
export class SeedService implements OnModuleInit {
    constructor(private prisma: PrismaService) {}
    
    async onModuleInit() {
        await this.seedInterests()
        await this.seedPlans()
        await this.seedCitiesRegions()
        await this.seedComplaints()
    }

    private async seedInterests() {
        try {
            const count = await this.prisma.interest.count()

            if (count === 0) {
                await this.prisma.interest.createMany({
                    data: interestsVarsList,
                    skipDuplicates: true,
                })

                console.log('✅ Интересы загружены в бд')
            }

            console.log('⚠️  Интересы уже есть в бд')
            
        } catch (error) {
            console.log('❌ Ошибка загрузки интересов в бд')
            
            throw error
        }
    }

    private async seedPlans() {
        try {
            const count = await this.prisma.plans.count()

            if( count === 0) {
                await this.prisma.plans.createMany({
                    data: plansVarsList,
                    skipDuplicates: true,
                })

                console.log('✅ Планы загружены в бд')
            }

            console.log('⚠️  Планы уже есть в бд')

        } catch (error) {
            console.log('❌ Ошибка загрузки планов в бд')
            
            throw error
        }
    }

    private async seedCitiesRegions() {
        try {
            const constCityes = await this.prisma.cityes.count()
            const countRegions = await this.prisma.regions.count()

            if(constCityes !== 0 && countRegions !== 0) {
                console.log('⚠️  Города и районы уже есть в бд')

                return
            }

            const cityList: CityItem[] = cities

            const sortedCityes = cityList.filter((item: CityItem) => 
                item.contentType === 'city' && item.population >= 500_000)

            const resCityes = sortedCityes.map((item: CityItem) => ({
                id: item.id,
                value: item.label,
                label: item.name,
            }))

            if(constCityes === 0) {
                await Promise.all(
                    resCityes.map(city =>
                        this.prisma.cityes.upsert({
                            where: { id: city.id },
                            update: {},
                            create: {
                                id: city.id,
                                value: city.value,
                                label: city.label,
                            },
                        })
                    )
                )

                console.log('✅ Города загружены в бд')
            } else {
                console.log('⚠️  Города уже есть в бд')
            }

            if(countRegions === 0) {
                const regionsList: RegionsItem = regions

                for (const [cityLabel, regionArr] of Object.entries(regionsList)) {
                    const city = resCityes.find(c => c.label === cityLabel)

                    if (!city) continue

                    for (const region of regionArr) {
                        await this.prisma.regions.upsert({
                            where: {
                                cityId_value: {
                                    cityId: city.id,
                                    value: region.value,
                                }
                            },
                            update: {
                                label: region.label,
                            },
                            create: {
                                cityId: city.id,
                                value: region.value,
                                label: region.label,
                            },
                        })
                    }
                }

                console.log('✅ Районы загружены в бд')
            } else {
                console.log('⚠️  Районы уже есть в бд')
            }

        } catch (error) {
            console.log('❌ Ошибка загрузки городов или интересов в бд')

            throw error
        }
    }

    private async seedComplaints() {
        try {
            const globCount = await this.prisma.complaintGlobVars.count()
            const descCount = await this.prisma.complaintDescVars.count()

            if(globCount !== 0 && descCount !== 0) {
                console.log('⚠️  Жалобы уже есть в бд')

                return
            }


            const globMap: Record<string, number> = {}

            for (const glob of complaintsGlobVars) {
                const created = await this.prisma.complaintGlobVars.upsert({
                    where: { value: glob.value },
                    update: {
                        label: glob.label,
                    },
                    create: {
                        value: glob.value,
                        label: glob.label,
                    },
                })

                globMap[glob.value] = created.id
            }

            for (const desc of complaintDescVars) {
                await this.prisma.complaintDescVars.upsert({
                    where: { value: desc.value },
                    update: {
                        label: desc.label,
                        globVal: desc.globVal,
                        globId: globMap[desc.globVal],
                    },
                    create: {
                        value: desc.value,
                        label: desc.label,
                        globVal: desc.globVal,
                        globId: globMap[desc.globVal],
                    },
                })
            }

            console.log('✅ Жалобы загружены в бд')

        } catch (error) {
            console.log('❌ Ошибка загрузки жалоб в бд')

            throw error
        }
    }
}
