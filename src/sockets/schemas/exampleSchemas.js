import { z } from 'zod';
import xss from 'xss';

// Fonction helper pour sanitiser les strings avec XSS
const sanitizeString = (str) => xss(str, {
  whiteList: {}, // Aucune balise HTML autorisée
  stripIgnoreTag: true,
  stripIgnoreTagBody: ['script']
});

// Schema de base pour un string sanitisé
const sanitizedString = () => z.string().transform(sanitizeString);

// Schema pour un string sanitisé optionnel
const optionalSanitizedString = () => z.string().optional().transform((str) => str ? sanitizeString(str) : str);

// Schema pour un string sanitisé nullable
const nullableSanitizedString = () => z.string().nullable().transform((str) => str ? sanitizeString(str) : str);

// Schema pour un string sanitisé optionnel ET nullable
const optionalNullableSanitizedString = () => z.string().optional().nullable().transform((str) => str ? sanitizeString(str) : str);

// Schémas pour le handler Auth
export const authRegisterRequestSchema = z.object({
  pseudo: sanitizedString().min(3, 'Le pseudo doit faire au moins 3 caractères').max(20, 'Le pseudo ne peut pas dépasser 20 caractères')
});

export const authSendCodeSchema = z.object({
  pseudo: sanitizedString().min(3, 'Le pseudo doit faire au moins 3 caractères'),
  type: z.enum(['register', 'password_change'], {
    errorMap: () => ({ message: 'Type must be register or password_change' })
  })
});

export const authVerifyCodeSchema = z.object({
  pseudo: sanitizedString().min(3, 'Le pseudo doit faire au moins 3 caractères'),
  code: sanitizedString().length(6, 'Le code doit faire exactement 6 caractères'),
  type: z.enum(['register', 'password_change'], {
    errorMap: () => ({ message: 'Type must be register or password_change' })
  })
});

export const authSetPasswordSchema = z.object({
  pseudo: sanitizedString().min(3, 'Le pseudo doit faire au moins 3 caractères'),
  password: sanitizedString().min(8, 'Le mot de passe doit faire au moins 8 caractères'),
  confirmPassword: sanitizedString().min(8, 'La confirmation doit faire au moins 8 caractères'),
  code: sanitizedString().length(6, 'Le code doit faire exactement 6 caractères'),
  type: z.enum(['register', 'password_change'], {
    errorMap: () => ({ message: 'Type must be register or password_change' })
  })
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"]
});

export const authLoginSchema = z.object({
  pseudo: sanitizedString().min(3, 'Le pseudo doit faire au moins 3 caractères'),
  password: sanitizedString().min(1, 'Le mot de passe est requis')
});

export const authLogoutSchema = z.object({
  pseudo: sanitizedString().min(3, 'Le pseudo doit faire au moins 3 caractères')
});

export const authPasswordChangeRequestSchema = z.object({
  pseudo: sanitizedString().min(3, 'Le pseudo doit faire au moins 3 caractères')
});

// Nouveaux schémas pour l'authentification Minecraft
export const minecraftSignupRequestSchema = z.object({
  pseudo: sanitizedString().min(3, 'Le pseudo doit faire au moins 3 caractères').max(20, 'Le pseudo ne peut pas dépasser 20 caractères')
});

export const webCompleteSignupSchema = z.object({
  pseudo: sanitizedString().min(3, 'Le pseudo doit faire au moins 3 caractères'),
  code: sanitizedString().length(6, 'Le code doit faire exactement 6 caractères'),
  password: sanitizedString().min(8, 'Le mot de passe doit faire au moins 8 caractères'),
  confirmPassword: sanitizedString().min(8, 'La confirmation doit faire au moins 8 caractères')
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"]
});

export const minecraftPlayerConnectSchema = z.object({
  pseudo: sanitizedString().min(3, 'Le pseudo doit faire au moins 3 caractères')
});

export const minecraftPlayerDisconnectSchema = z.object({
  pseudo: sanitizedString().min(3, 'Le pseudo doit faire au moins 3 caractères')
});

export const minecraftPasswordChangeRequestSchema = z.object({
  pseudo: sanitizedString().min(3, 'Le pseudo doit faire au moins 3 caractères')
});

export const webCompletePasswordChangeSchema = z.object({
  pseudo: sanitizedString().min(3, 'Le pseudo doit faire au moins 3 caractères'),
  code: sanitizedString().length(6, 'Le code doit faire exactement 6 caractères'),
  password: sanitizedString().min(8, 'Le mot de passe doit faire au moins 8 caractères'),
  confirmPassword: sanitizedString().min(8, 'La confirmation doit faire au moins 8 caractères')
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"]
});

// Schémas pour le handler Companies
export const companyCreateSchema = z.object({
  name: sanitizedString().min(2, 'Le nom de l\'entreprise doit faire au moins 2 caractères').max(50, 'Le nom ne peut pas dépasser 50 caractères'),
  description: optionalSanitizedString(),
  sector: optionalSanitizedString(),
  ownerPseudo: sanitizedString().min(3, 'Le pseudo du propriétaire doit faire au moins 3 caractères')
});

export const companyUpdateSchema = z.object({
  companyId: z.string().min(1, 'L\'ID de l\'entreprise est requis'),
  name: optionalSanitizedString(),
  description: optionalSanitizedString(),
  sector: optionalSanitizedString(),
  updaterPseudo: sanitizedString().min(3, 'Le pseudo du modificateur est requis')
});

export const companyDeleteSchema = z.object({
  companyId: z.string().min(1, 'L\'ID de l\'entreprise est requis'),
  deleterPseudo: sanitizedString().min(3, 'Le pseudo du suppresseur est requis')
});

export const companyAddPlayerSchema = z.object({
  companyId: z.string().min(1, 'L\'ID de l\'entreprise est requis'),
  playerPseudo: sanitizedString().min(3, 'Le pseudo du joueur doit faire au moins 3 caractères'),
  position: optionalSanitizedString(),
  salary: z.number().min(0, 'Le salaire doit être positif').optional(),
  recruiterPseudo: sanitizedString().min(3, 'Le pseudo du recruteur est requis')
});

export const companyRemovePlayerSchema = z.object({
  companyId: z.string().min(1, 'L\'ID de l\'entreprise est requis'),
  playerPseudo: sanitizedString().min(3, 'Le pseudo du joueur doit faire au moins 3 caractères'),
  removerPseudo: sanitizedString().min(3, 'Le pseudo de celui qui licencie est requis'),
  reason: optionalSanitizedString()
});

// Schémas pour le handler Economy
export const bankAccountCreateSchema = z.object({
  pseudo: sanitizedString().min(3, 'Le pseudo doit faire au moins 3 caractères'),
  accountType: z.enum(['savings', 'checking', 'business'], {
    errorMap: () => ({ message: 'Type de compte invalide' })
  }),
  initialBalance: z.number().min(0, 'Le solde initial doit être positif').optional().default(0)
});

export const bankAccountDeleteSchema = z.object({
  accountId: z.string().min(1, 'L\'ID du compte est requis'),
  ownerPseudo: sanitizedString().min(3, 'Le pseudo du propriétaire est requis')
});

export const priceFluctuationSchema = z.object({
  itemId: z.string().min(1, 'L\'ID de l\'item est requis'),
  itemName: sanitizedString().min(1, 'Le nom de l\'item est requis'),
  oldPrice: z.number().min(0, 'L\'ancien prix doit être positif'),
  newPrice: z.number().min(0, 'Le nouveau prix doit être positif'),
  changePercentage: z.number(),
  marketType: z.enum(['buy', 'sell'], {
    errorMap: () => ({ message: 'Type de marché invalide' })
  }),
  serverPseudo: sanitizedString().min(3, 'Le pseudo du serveur est requis')
});

export const transactionWebRequestSchema = z.object({
  fromPseudo: sanitizedString().min(3, 'Le pseudo de l\'expéditeur est requis'),
  toPseudo: sanitizedString().min(3, 'Le pseudo du destinataire est requis'),
  amount: z.number().min(0.01, 'Le montant doit être supérieur à 0'),
  description: optionalSanitizedString(),
  transactionType: z.enum(['transfer', 'payment', 'salary', 'purchase'], {
    errorMap: () => ({ message: 'Type de transaction invalide' })
  })
});

export const transactionMinecraftConfirmationSchema = z.object({
  transactionId: z.string().min(1, 'L\'ID de la transaction est requis'),
  success: z.boolean(),
  errorMessage: optionalSanitizedString(),
  fromBalance: z.number().min(0, 'Le solde de l\'expéditeur doit être positif').optional(),
  toBalance: z.number().min(0, 'Le solde du destinataire doit être positif').optional(),
  serverPseudo: sanitizedString().min(3, 'Le pseudo du serveur est requis')
});

export const transactionMinecraftDirectSchema = z.object({
  fromPseudo: sanitizedString().min(3, 'Le pseudo de l\'expéditeur est requis'),
  toPseudo: sanitizedString().min(3, 'Le pseudo du destinataire est requis'),
  amount: z.number().min(0.01, 'Le montant doit être supérieur à 0'),
  description: optionalSanitizedString(),
  transactionType: z.enum(['transfer', 'payment', 'salary', 'purchase', 'reward', 'penalty'], {
    errorMap: () => ({ message: 'Type de transaction invalide' })
  }),
  fromBalance: z.number().min(0, 'Le solde de l\'expéditeur doit être positif'),
  toBalance: z.number().min(0, 'Le solde du destinataire doit être positif'),
  serverPseudo: sanitizedString().min(3, 'Le pseudo du serveur est requis')
});

// Schémas pour le handler Drives
export const drivePurchaseSchema = z.object({
  driveId: z.string().min(1, 'L\'ID du drive est requis'),
  buyerPseudo: sanitizedString().min(3, 'Le pseudo de l\'acheteur est requis'),
  items: z.array(z.object({
    itemId: z.string().min(1, 'L\'ID de l\'article est requis'),
    quantity: z.number().min(1, 'La quantité doit être supérieure à 0'),
    unitPrice: z.number().min(0, 'Le prix unitaire doit être positif')
  })).min(1, 'Au moins un article doit être acheté'),
  totalAmount: z.number().min(0.01, 'Le montant total doit être supérieur à 0')
});

export const driveAddItemSchema = z.object({
  driveId: z.string().min(1, 'L\'ID du drive est requis'),
  itemName: sanitizedString().min(1, 'Le nom de l\'article est requis'),
  itemDescription: optionalSanitizedString(),
  price: z.number().min(0, 'Le prix doit être positif'),
  stock: z.number().min(0, 'Le stock doit être positif'),
  category: optionalSanitizedString(),
  adderPseudo: sanitizedString().min(3, 'Le pseudo de celui qui ajoute est requis')
});

export const driveUpdateItemSchema = z.object({
  driveId: z.string().min(1, 'L\'ID du drive est requis'),
  itemId: z.string().min(1, 'L\'ID de l\'article est requis'),
  itemName: optionalSanitizedString(),
  itemDescription: optionalSanitizedString(),
  price: z.number().min(0, 'Le prix doit être positif').optional(),
  stock: z.number().min(0, 'Le stock doit être positif').optional(),
  category: optionalSanitizedString(),
  updaterPseudo: sanitizedString().min(3, 'Le pseudo du modificateur est requis')
});

export const driveRemoveItemSchema = z.object({
  driveId: z.string().min(1, 'L\'ID du drive est requis'),
  itemId: z.string().min(1, 'L\'ID de l\'article est requis'),
  removerPseudo: sanitizedString().min(3, 'Le pseudo de celui qui supprime est requis'),
  reason: optionalSanitizedString()
});

export const driveWithdrawItemsSchema = z.object({
  driveId: z.string().min(1, 'L\'ID du drive est requis'),
  items: z.array(z.object({
    itemId: z.string().min(1, 'L\'ID de l\'article est requis'),
    quantity: z.number().min(1, 'La quantité doit être supérieure à 0')
  })).min(1, 'Au moins un article doit être retiré'),
  withdrawerPseudo: sanitizedString().min(3, 'Le pseudo de celui qui retire est requis'),
  reason: optionalSanitizedString()
});