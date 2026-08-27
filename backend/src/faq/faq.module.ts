import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FaqController } from './faq.controller';
import { FaqService } from './faq.service';
import { Faq } from './entities/faq.entity';
import { FaqCategory } from './entities/faq-category.entity';
import { FaqCategoryController } from './faq-category.controller';
import { FaqCategoryService } from './faq-category.service';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from '../auth/roles.guard';

@Module({
  imports: [TypeOrmModule.forFeature([Faq, FaqCategory]), AuthModule],
  controllers: [FaqController, FaqCategoryController],
  providers: [FaqService, FaqCategoryService, RolesGuard],
  exports: [FaqService, FaqCategoryService],
})
export class FaqModule {}
