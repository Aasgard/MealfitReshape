import { Timestamp } from 'firebase/firestore'
import type { Recipe } from '~/types/recipe'

/**
 * Fausses recettes pour affichage / développement avant la mise en place du modèle Firestore.
 */
export const fakeRecipes: Recipe[] = [
  {
    id: 'fake-1',
    title: 'Salade César',
    description: 'Salade romaine, poulet grillé, parmesan, croûtons et sauce césar maison. Un classique indémodable.',
    updatedAt: Timestamp.fromDate(new Date('2024-02-01T12:00:00')),
    createdAt: Timestamp.fromDate(new Date('2024-01-15T10:30:00')),
    isPublic: true,
    owner: null
  },
  {
    id: 'fake-2',
    title: 'Pâtes carbonara',
    description: 'Spaghettis, guanciale, œufs, pecorino et poivre noir. Cuisinez les pâtes al dente pour un résultat parfait.',
    updatedAt: Timestamp.fromDate(new Date('2024-02-05T18:45:00')),
    createdAt: Timestamp.fromDate(new Date('2024-01-20T14:00:00')),
    isPublic: true,
    owner: null
  },
  {
    id: 'fake-3',
    title: 'Tajine de poulet aux olives',
    description: 'Poulet, olives, citron confit, épices et légumes. Laisser mijoter longuement pour des saveurs intenses.',
    updatedAt: Timestamp.fromDate(new Date('2024-02-08T09:20:00')),
    createdAt: Timestamp.fromDate(new Date('2024-01-22T11:00:00')),
    isPublic: false,
    owner: null
  },
  {
    id: 'fake-4',
    title: 'Quiche lorraine',
    description: 'Pâte brisée, lardons, appareil à quiche (crème, œufs, muscade). À déguster tiède ou froide.',
    updatedAt: Timestamp.fromDate(new Date('2024-02-10T16:30:00')),
    createdAt: Timestamp.fromDate(new Date('2024-01-25T08:15:00')),
    isPublic: true,
    owner: null
  },
  {
    id: 'fake-5',
    title: 'Curry de légumes et pois chiches',
    description: 'Courgettes, poivrons, pois chiches, lait de coco et curry. Un plat végétarien réconfortant.',
    updatedAt: Timestamp.fromDate(new Date('2024-02-11T13:00:00')),
    createdAt: Timestamp.fromDate(new Date('2024-01-28T17:45:00')),
    isPublic: true,
    owner: null
  },
  {
    id: 'fake-6',
    title: 'Soupe à l\'oignon gratinée',
    description: 'Oignons caramélisés, bouillon de bœuf, pain et fromage gratiné. Idéal pour les soirées d\'hiver.',
    updatedAt: Timestamp.fromDate(new Date('2024-02-12T19:00:00')),
    createdAt: Timestamp.fromDate(new Date('2024-02-01T12:30:00')),
    isPublic: true,
    owner: null
  },
  {
    id: 'fake-7',
    title: 'Risotto aux champignons',
    description: 'Riz arborio, champignons frais, bouillon, parmesan et persil. Remuer régulièrement pour un risotto crémeux.',
    updatedAt: Timestamp.fromDate(new Date('2024-02-09T11:15:00')),
    createdAt: Timestamp.fromDate(new Date('2024-01-18T15:20:00')),
    isPublic: false,
    owner: null
  },
  {
    id: 'fake-8',
    title: 'Poulet rôti aux herbes',
    description: 'Poulet entier, thym, romarin, ail et citron. Enfourner 1h à 180°C pour une viande dorée et juteuse.',
    updatedAt: Timestamp.fromDate(new Date('2024-02-07T14:30:00')),
    createdAt: Timestamp.fromDate(new Date('2024-01-12T09:00:00')),
    isPublic: true,
    owner: null
  },
  {
    id: 'fake-9',
    title: 'Tarte tatin',
    description: 'Pommes caramélisées au beurre et au sucre, recouvertes de pâte feuilletée. Servir avec une boule de glace vanille.',
    updatedAt: Timestamp.fromDate(new Date('2024-02-06T20:00:00')),
    createdAt: Timestamp.fromDate(new Date('2024-01-30T16:00:00')),
    isPublic: true,
    owner: null
  },
  {
    id: 'fake-10',
    title: 'Bowl poke saumon',
    description: 'Riz, saumon cru mariné, avocat, concombre, edamame et sauce soja. Un repas frais et équilibré.',
    updatedAt: Timestamp.fromDate(new Date('2024-02-11T12:45:00')),
    createdAt: Timestamp.fromDate(new Date('2024-02-05T10:00:00')),
    isPublic: true,
    owner: null
  },
  {
    id: 'fake-11',
    title: 'Salade de fruits',
    description: 'Fruits frais (banane, pomme, ananas, kiwi) mélangés avec une vinaigrette maison. Un repas végétal léger et frais.',
    updatedAt: Timestamp.fromDate(new Date('2024-02-12T13:30:00')),
    createdAt: Timestamp.fromDate(new Date('2024-02-06T11:15:00')),
    isPublic: true,
    owner: null
  },
  {
    id: 'fake-12',
    title: 'Salade de fruits',
    description: 'Fruits frais (banane, pomme, ananas, kiwi) mélanges avec une vinaigrette maison. Un repas végétal léger et frais.',
    updatedAt: Timestamp.fromDate(new Date('2024-02-13T14:15:00')),
    createdAt: Timestamp.fromDate(new Date('2024-02-07T12:00:00')),
    isPublic: true,
    owner: null
  }
]
