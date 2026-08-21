import { z } from "zod";

const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v === "" ? undefined : v));

const optionalId = z
  .string()
  .optional()
  .nullable()
  .transform((v) => (v === "" || v == null ? null : v));

export const memberSchema = z.object({
  full_name: z.string().trim().min(1, "Vui lòng nhập họ và tên"),
  nickname: optionalString,
  gender: z.enum(["male", "female", "other"]),
  birth_date: optionalString,
  death_date: optionalString,
  birth_place: optionalString,
  hometown: optionalString,
  address: optionalString,
  occupation: optionalString,
  biography: optionalString,
  avatar_url: optionalString,
  generation: z.coerce
    .number({ invalid_type_error: "Đời phải là số" })
    .int("Đời phải là số nguyên")
    .min(1, "Đời tối thiểu là 1")
    .max(30, "Đời tối đa là 30"),
  branch_id: optionalId,
  is_alive: z.boolean(),
  visibility: z.enum(["public", "family", "private"]),
  father_id: optionalId,
  mother_id: optionalId,
  spouse_id: optionalId
});

export type MemberInput = z.infer<typeof memberSchema>;

export const branchSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên chi"),
  description: optionalString,
  ancestor_id: optionalId
});

export type BranchInput = z.infer<typeof branchSchema>;
