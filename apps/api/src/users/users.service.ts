import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { InjectPinoLogger, PinoLogger } from "nestjs-pino";
import { desc, eq } from "drizzle-orm";
import { users, type NewUser, type User } from "@cometkit/db";
import type {
  AuthUser,
  CreateUserInput,
  ListUsersQuery,
  Paginated,
  UpdateProfileInput,
  UpdateUserInput,
  UserDto,
} from "@cometkit/shared";
import { hashPassword } from "../common/password";
import { TenantScopedDb } from "../tenancy/tenant-scoped-db";
import { buildPageMeta, canDeleteUser, toUserDto } from "./users.policy";

@Injectable()
export class UsersService {
  constructor(
    private readonly db: TenantScopedDb,
    @InjectPinoLogger(UsersService.name)
    private readonly logger: PinoLogger,
  ) {}

  async findByEmail(email: string): Promise<User | undefined> {
    const [row] = await this.db.select(users, eq(users.email, email));
    return row as User | undefined;
  }

  async findById(id: string): Promise<User | undefined> {
    const [row] = await this.db.select(users, eq(users.id, id));
    return row as User | undefined;
  }

  async create(data: Omit<NewUser, "tenantId">): Promise<User> {
    const [row] = await this.db.insertValues(users, data);
    if (!row) throw new Error("Insert returned no row");
    this.logger.info({ userId: (row as User).id, role: (row as User).role }, "user.created");
    return row as User;
  }

  /** Admin: paginated list, newest first (ULIDs sort by creation time). */
  async list(query: ListUsersQuery): Promise<Paginated<UserDto>> {
    const { page, limit } = query;
    const [rows, total] = await Promise.all([
      this.db.select(users).orderBy(desc(users.id)).limit(limit).offset((page - 1) * limit),
      this.db.count(users),
    ]);
    return { data: (rows as User[]).map(toUserDto), meta: buildPageMeta(page, limit, total) };
  }

  /** Admin: create a user with an explicit role. */
  async createUser(input: CreateUserInput): Promise<UserDto> {
    const existing = await this.findByEmail(input.email);
    if (existing) {
      throw new ConflictException("An account with this email already exists");
    }
    const row = await this.create({
      email: input.email,
      passwordHash: await hashPassword(input.password),
      name: input.name ?? null,
      role: input.role,
    });
    return toUserDto(row);
  }

  /** Admin: update name and/or role. */
  async updateUser(id: string, input: UpdateUserInput): Promise<UserDto> {
    const [row] = await this.db.update(users, input, eq(users.id, id));
    if (!row) throw new NotFoundException("User not found");
    if (input.role) {
      this.logger.info({ userId: id, role: input.role }, "user.role_changed");
    }
    return toUserDto(row as User);
  }

  /** Admin: delete any user except yourself. */
  async deleteUser(actor: AuthUser, id: string): Promise<void> {
    if (!canDeleteUser(actor, id)) {
      throw new ForbiddenException("You cannot delete your own account");
    }
    const [row] = await this.db.deleteFrom(users, eq(users.id, id));
    if (!row) throw new NotFoundException("User not found");
    this.logger.info({ userId: id, actorId: actor.id }, "user.deleted");
  }

  /** Any signed-in user: update own profile. */
  async updateProfile(
    actorId: string,
    input: UpdateProfileInput,
  ): Promise<UserDto> {
    const [row] = await this.db.update(users, { name: input.name }, eq(users.id, actorId));
    if (!row) throw new NotFoundException("User not found");
    return toUserDto(row as User);
  }
}
