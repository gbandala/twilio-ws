import { Table, Column, Model, DataType } from 'sequelize-typescript';
import { WebSocketConfigDTO } from '../dtos/wsDTO';

@Table({
  tableName: 'websocket_configs',
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at'
})
export class WebSocketConfig extends Model {
  @Column({
    type: DataType.STRING,
    primaryKey: true,
    field: 'id'
  })
  id!: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    field: 'phone_number'
  })
  phoneNumber!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: false,
    field: 'prompt'
  })
  prompt!: string;

  @Column({
    type: DataType.TEXT,
    allowNull: true,
    field: 'welcome_message'
  })
  welcomeMessage?: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    field: 'voice_model'
  })
  voiceModel!: string;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: true,
    field: 'is_active'
  })
  isActive!: boolean;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    field: 'base_path'
  })
  basePath!: string;

  // No es necesario definir explícitamente created_at y updated_at
  // ya que Sequelize las manejará automáticamente gracias a 
  // la configuración en el decorador @Table

  toDTO(): WebSocketConfigDTO {
    const dto = new WebSocketConfigDTO();
    dto.id = this.id;
    dto.phoneNumber = this.phoneNumber;
    dto.prompt = this.prompt;
    dto.welcomeMessage = this.welcomeMessage;
    dto.voiceModel = this.voiceModel;
    dto.isActive = this.isActive;
    dto.basePath = this.basePath;
    dto.created_at = this.createdAt;
    dto.updated_at = this.updatedAt;
    return dto;
  }
}