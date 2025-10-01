import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seeding services...')

  const services = [
    {
      name: 'Cera',
      description: 'Depilación con cera',
      category: 'Depilación',
      price: 25.00,
      duration: 30,
      isActive: true
    },
    {
      name: 'Láser',
      description: 'Depilación láser',
      category: 'Depilación',
      price: 60.00,
      duration: 45,
      isActive: true
    },
    {
      name: 'Limpieza de cara',
      description: 'Limpieza facial profunda',
      category: 'Tratamientos Faciales',
      price: 45.00,
      duration: 60,
      isActive: true
    }
  ]

  for (const service of services) {
    const created = await prisma.service.create({
      data: service
    })
    console.log(`✅ Created service: ${created.name}`)
  }

  console.log('✨ Seeding completed!')
}

main()
  .catch((e) => {
    console.error('❌ Error seeding:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
