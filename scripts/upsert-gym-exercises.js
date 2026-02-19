const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const ATTRIBUTE_NAME_SCOPE = ["TYPE", "PRIMARY_MUSCLE", "SECONDARY_MUSCLE", "EQUIPMENT", "MECHANICS_TYPE"];

const EXERCISES = [
  {
    slug: "machine-leg-press",
    name: "Machine Leg Press",
    nameEn: "Machine Leg Press",
    aliases: ["Machine Leg Press"],
    attributes: [
      ["TYPE", "STRENGTH"],
      ["PRIMARY_MUSCLE", "QUADRICEPS"],
      ["SECONDARY_MUSCLE", "GLUTES"],
      ["SECONDARY_MUSCLE", "HAMSTRINGS"],
      ["SECONDARY_MUSCLE", "CALVES"],
      ["EQUIPMENT", "MACHINE"],
      ["MECHANICS_TYPE", "COMPOUND"]
    ]
  },
  {
    slug: "plate-loaded-leg-press",
    name: "Plate Loaded Leg Press",
    nameEn: "Plate Loaded Leg Press",
    aliases: ["Plate Loaded Leg Press", "Leg Press (Plate Loaded)", "Leg Press"],
    attributes: [
      ["TYPE", "STRENGTH"],
      ["PRIMARY_MUSCLE", "QUADRICEPS"],
      ["SECONDARY_MUSCLE", "GLUTES"],
      ["SECONDARY_MUSCLE", "HAMSTRINGS"],
      ["SECONDARY_MUSCLE", "CALVES"],
      ["EQUIPMENT", "WEIGHT_PLATE"],
      ["MECHANICS_TYPE", "COMPOUND"]
    ]
  },
  {
    slug: "barbell-shrugs",
    name: "Barbell Shrugs",
    nameEn: "Barbell Shrugs",
    aliases: ["Barbell Shrugs", "Barbell Shoulder Shrugs"],
    attributes: [
      ["TYPE", "STRENGTH"],
      ["PRIMARY_MUSCLE", "TRAPS"],
      ["SECONDARY_MUSCLE", "SHOULDERS"],
      ["SECONDARY_MUSCLE", "FOREARMS"],
      ["EQUIPMENT", "BARBELL"],
      ["MECHANICS_TYPE", "ISOLATION"]
    ]
  },
  {
    slug: "dumbbell-shoulder-shrugs",
    name: "Dumbbell Shoulder Shrugs",
    nameEn: "Dumbbell Shoulder Shrugs",
    aliases: ["Dumbbell Shoulder Shrugs", "Shoulder Shrugs", "Dumbbell Shrugs"],
    attributes: [
      ["TYPE", "STRENGTH"],
      ["PRIMARY_MUSCLE", "TRAPS"],
      ["SECONDARY_MUSCLE", "SHOULDERS"],
      ["SECONDARY_MUSCLE", "FOREARMS"],
      ["EQUIPMENT", "DUMBBELL"],
      ["MECHANICS_TYPE", "ISOLATION"]
    ]
  },
  {
    slug: "dumbbell-bicep-curls",
    name: "Dumbbell Bicep Curls",
    nameEn: "Dumbbell Bicep Curls",
    aliases: ["Dumbbell Bicep Curls", "Dumbbell Biceps Curls"],
    attributes: [
      ["TYPE", "STRENGTH"],
      ["PRIMARY_MUSCLE", "BICEPS"],
      ["SECONDARY_MUSCLE", "FOREARMS"],
      ["EQUIPMENT", "DUMBBELL"],
      ["MECHANICS_TYPE", "ISOLATION"]
    ]
  },
  {
    slug: "dumbbell-chest-presses",
    name: "Dumbbell Chest Presses",
    nameEn: "Dumbbell Chest Presses",
    aliases: ["Dumbbell Chest Presses", "Dumbbell Chest Press"],
    attributes: [
      ["TYPE", "STRENGTH"],
      ["PRIMARY_MUSCLE", "CHEST"],
      ["SECONDARY_MUSCLE", "TRICEPS"],
      ["SECONDARY_MUSCLE", "SHOULDERS"],
      ["EQUIPMENT", "DUMBBELL"],
      ["MECHANICS_TYPE", "COMPOUND"]
    ]
  },
  {
    slug: "barbell-upright-row",
    name: "Barbell Upright Row",
    nameEn: "Barbell Upright Row",
    aliases: ["Barbell Upright Row"],
    attributes: [
      ["TYPE", "STRENGTH"],
      ["PRIMARY_MUSCLE", "SHOULDERS"],
      ["SECONDARY_MUSCLE", "TRAPS"],
      ["SECONDARY_MUSCLE", "BICEPS"],
      ["EQUIPMENT", "BARBELL"],
      ["MECHANICS_TYPE", "COMPOUND"]
    ]
  },
  {
    slug: "barbell-romanian-deadlifts",
    name: "Barbell Romanian Deadlifts",
    nameEn: "Barbell Romanian Deadlifts",
    aliases: ["Barbell Romanian Deadlifts", "Barbell Romanian Deadlift"],
    attributes: [
      ["TYPE", "STRENGTH"],
      ["PRIMARY_MUSCLE", "HAMSTRINGS"],
      ["SECONDARY_MUSCLE", "GLUTES"],
      ["SECONDARY_MUSCLE", "BACK"],
      ["EQUIPMENT", "BARBELL"],
      ["MECHANICS_TYPE", "COMPOUND"]
    ]
  },
  {
    slug: "barbell-shoulder-press",
    name: "Barbell Shoulder Press",
    nameEn: "Barbell Shoulder Press",
    aliases: ["Barbell Shoulder Press", "Barbell Shoulder Presses", "Barbell Overhead Press"],
    attributes: [
      ["TYPE", "STRENGTH"],
      ["PRIMARY_MUSCLE", "SHOULDERS"],
      ["SECONDARY_MUSCLE", "TRICEPS"],
      ["SECONDARY_MUSCLE", "CHEST"],
      ["EQUIPMENT", "BARBELL"],
      ["MECHANICS_TYPE", "COMPOUND"]
    ]
  },
  {
    slug: "barbell-standing-calf-raise",
    name: "Barbell Standing Calf Raise",
    nameEn: "Barbell Standing Calf Raise",
    aliases: ["Barbell Standing Calf Raise", "Standing Barbell Calf Raise"],
    attributes: [
      ["TYPE", "STRENGTH"],
      ["PRIMARY_MUSCLE", "CALVES"],
      ["SECONDARY_MUSCLE", "HAMSTRINGS"],
      ["EQUIPMENT", "BARBELL"],
      ["MECHANICS_TYPE", "ISOLATION"]
    ]
  }
];

async function ensureAttributeName(name) {
  return prisma.exerciseAttributeName.upsert({
    where: { name },
    update: {},
    create: { name }
  });
}

async function ensureAttributeValue(attributeNameId, value) {
  const existing = await prisma.exerciseAttributeValue.findFirst({
    where: {
      attributeNameId,
      value
    }
  });

  if (existing) return existing;

  return prisma.exerciseAttributeValue.create({
    data: {
      attributeNameId,
      value
    }
  });
}

async function resolveExercise(definition) {
  const existing = await prisma.exercise.findFirst({
    where: {
      OR: [{ slug: definition.slug }, { nameEn: { in: definition.aliases } }, { name: { in: definition.aliases } }]
    }
  });

  if (existing) {
    return prisma.exercise.update({
      where: { id: existing.id },
      data: {
        name: definition.name,
        nameEn: definition.nameEn,
        slug: existing.slug || definition.slug,
        slugEn: existing.slugEn || definition.slug,
        description: existing.description || null,
        descriptionEn: existing.descriptionEn || null,
        introduction: existing.introduction || null,
        introductionEn: existing.introductionEn || null
      }
    });
  }

  return prisma.exercise.create({
    data: {
      name: definition.name,
      nameEn: definition.nameEn,
      slug: definition.slug,
      slugEn: definition.slug,
      description: null,
      descriptionEn: null,
      introduction: null,
      introductionEn: null,
      fullVideoUrl: null,
      fullVideoImageUrl: null
    }
  });
}

async function upsertExerciseWithAttributes(definition) {
  const exercise = await resolveExercise(definition);

  await prisma.exerciseAttribute.deleteMany({
    where: {
      exerciseId: exercise.id,
      attributeName: {
        name: {
          in: ATTRIBUTE_NAME_SCOPE
        }
      }
    }
  });

  const uniquePairs = Array.from(new Map(definition.attributes.map((pair) => [pair.join("::"), pair])).values());

  for (const [attributeName, attributeValue] of uniquePairs) {
    const attributeNameRow = await ensureAttributeName(attributeName);
    const attributeValueRow = await ensureAttributeValue(attributeNameRow.id, attributeValue);

    await prisma.exerciseAttribute.create({
      data: {
        exerciseId: exercise.id,
        attributeNameId: attributeNameRow.id,
        attributeValueId: attributeValueRow.id
      }
    });
  }

  return exercise;
}

async function main() {
  console.log("Upserting custom gym exercises...");

  for (const definition of EXERCISES) {
    const exercise = await upsertExerciseWithAttributes(definition);
    console.log(`- ${definition.nameEn} (${exercise.id})`);
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
