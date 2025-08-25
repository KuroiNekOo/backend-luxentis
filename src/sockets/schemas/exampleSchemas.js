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