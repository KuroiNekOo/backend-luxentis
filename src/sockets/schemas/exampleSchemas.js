import { z } from 'zod';

// Schéma pour le handler User
export const userActionSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  action: z.string().min(1, 'Action is required'),
  data: z.object({
    message: z.string().optional()
  }).optional()
});

// Schéma pour le handler Product
export const productActionSchema = z.object({
  productId: z.union([z.string(), z.number()]).transform(String), // Accepte string ou number, converti en string
  operation: z.enum(['create', 'update', 'delete'], {
    errorMap: () => ({ message: 'Operation must be create, update, or delete' })
  }),
  payload: z.object({
    name: z.string().optional(),
    price: z.number().positive().optional()
  }).optional()
});

// Schémas pour le handler Auth
export const authRegisterRequestSchema = z.object({
  pseudo: z.string().min(3, 'Le pseudo doit faire au moins 3 caractères').max(20, 'Le pseudo ne peut pas dépasser 20 caractères')
});

export const authSendCodeSchema = z.object({
  pseudo: z.string().min(3, 'Le pseudo doit faire au moins 3 caractères'),
  type: z.enum(['register', 'password_change'], {
    errorMap: () => ({ message: 'Type must be register or password_change' })
  })
});

export const authVerifyCodeSchema = z.object({
  pseudo: z.string().min(3, 'Le pseudo doit faire au moins 3 caractères'),
  code: z.string().length(6, 'Le code doit faire exactement 6 caractères'),
  type: z.enum(['register', 'password_change'], {
    errorMap: () => ({ message: 'Type must be register or password_change' })
  })
});

export const authSetPasswordSchema = z.object({
  pseudo: z.string().min(3, 'Le pseudo doit faire au moins 3 caractères'),
  password: z.string().min(8, 'Le mot de passe doit faire au moins 8 caractères'),
  confirmPassword: z.string().min(8, 'La confirmation doit faire au moins 8 caractères'),
  code: z.string().length(6, 'Le code doit faire exactement 6 caractères'),
  type: z.enum(['register', 'password_change'], {
    errorMap: () => ({ message: 'Type must be register or password_change' })
  })
}).refine((data) => data.password === data.confirmPassword, {
  message: "Les mots de passe ne correspondent pas",
  path: ["confirmPassword"]
});

export const authLoginSchema = z.object({
  pseudo: z.string().min(3, 'Le pseudo doit faire au moins 3 caractères'),
  password: z.string().min(1, 'Le mot de passe est requis')
});

export const authLogoutSchema = z.object({
  pseudo: z.string().min(3, 'Le pseudo doit faire au moins 3 caractères')
});

export const authPasswordChangeRequestSchema = z.object({
  pseudo: z.string().min(3, 'Le pseudo doit faire au moins 3 caractères')
});