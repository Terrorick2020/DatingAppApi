export const lifeStagesForPrisma = [
  {
    key: 'youth',
    label: 'Молодёжь',
    minAge: 18,
    maxAge: 25,
    description: 'Начало взрослой жизни, обучение, первые серьёзные отношения.',
  },
  {
    key: 'youngAdults',
    label: 'Молодые взрослые',
    minAge: 26,
    maxAge: 35,
    description: 'Становление в профессии, создание семьи, активные знакомства.',
  },
  {
    key: 'adults',
    label: 'Взрослые',
    minAge: 36,
    maxAge: 45,
    description: 'Стабильность, воспитание детей, развитие карьеры.',
  },
  {
    key: 'matureAdults',
    label: 'Зрелые взрослые',
    minAge: 46,
    maxAge: 59,
    description: 'Самореализация, забота о здоровье, поиск новых смыслов.',
  },
  {
    key: 'seniors',
    label: 'Пожилые',
    minAge: 60,
    maxAge: 74,
    description: 'Активная старость, хобби, путешествия, новые интересы.',
  },
  {
    key: 'elders',
    label: 'Старшее поколение',
    minAge: 75,
    maxAge: 100,
    description: 'Спокойная жизнь, поддержка близких, передача опыта.',
  },
]

export function getAgeRange(age: number) {
  return lifeStagesForPrisma.find((range) => age >= range.minAge && age <= range.maxAge)
}
