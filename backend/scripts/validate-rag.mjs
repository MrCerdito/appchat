import { NestFactory } from '@nestjs/core';
import { DataSource } from 'typeorm';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  console.log('===> INICIANDO CONTEXTO DE VALIDACIÓN DE RAG <===');

  // Cargar variables de entorno manualmente de backend/.env para el script de consola antes de importar AppModule
  const envPath = path.resolve('backend/.env');
  if (fs.existsSync(envPath)) {
    const envConfig = fs.readFileSync(envPath, 'utf8');
    envConfig.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
        const parts = trimmed.split('=');
        const key = parts[0].trim();
        const val = parts.slice(1).join('=').trim().replace(/^["']|["']$/g, '');
        process.env[key] = val;
      }
    });
  }

  // Importar dinámicamente para que process.env esté poblado antes de la inicialización de Joi en AppModule
  const { AppModule } = await import('../dist/src/app.module.js');
  const { DocumentosService, normalizarColegio } = await import('../dist/src/documentos/documentos.service.js');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  const docsService = app.get(DocumentosService);
  const dataSource = app.get(DataSource);

  try {
    // 1. Limpiar documentos de prueba previos (para que sea idempotente)
    console.log('\n[1/5] Limpiando documentos de prueba previos...');
    await dataSource.query("DELETE FROM documentos WHERE nombre LIKE '[TEST-RAG]%';");

    // 2. Crear PDFs simulados en formato buffer (contenido de texto plano)
    console.log('\n[2/5] Creando documentos de prueba para roles y colegios...');
    const testDocs = [
      {
        nombre: '[TEST-RAG] Manual de Convivencia Estudiante',
        descripcion: 'Reglamento para estudiantes del Colegio San José',
        categoria: 'reglamento',
        colegio: 'Colegio San José',
        rolesPermitidos: ['estudiante'],
        texto: 'El horario de entrada para estudiantes en el Colegio San José es a las 7:00 AM. Los estudiantes deben portar el uniforme formal diariamente.',
      },
      {
        nombre: '[TEST-RAG] Manual de Convivencia Docente',
        descripcion: 'Reglamento para profesores del Colegio San José',
        categoria: 'reglamento',
        colegio: 'Colegio San José',
        rolesPermitidos: ['docente'],
        texto: 'El horario de ingreso para docentes en el Colegio San José es a las 6:30 AM. Deben registrar su asistencia en el lector biométrico.',
      },
      {
        nombre: '[TEST-RAG] Información Financiera Padres',
        descripcion: 'Métodos de pago para acudientes del Colegio San José',
        categoria: 'pagos',
        colegio: 'Colegio San José',
        rolesPermitidos: ['padre'],
        texto: 'Las pensiones del Colegio San José se pagan los primeros 5 días de cada mes mediante transferencia o en el Banco Bogotá.',
      },
      {
        nombre: '[TEST-RAG] Información General Administrativo',
        descripcion: 'Documento global para administradores de todos los colegios',
        categoria: 'general',
        colegio: null, // Global
        rolesPermitidos: ['administrador'],
        texto: 'La plataforma del sistema se actualiza los sábados a las 11:00 PM. Los administradores tienen acceso completo a los logs del sistema.',
      },
      {
        nombre: '[TEST-RAG] Restablecimiento de Contraseña Estudiantes',
        descripcion: 'Guía paso a paso para recuperar la clave de acceso a la plataforma',
        categoria: 'soporte',
        colegio: 'Colegio San José',
        rolesPermitidos: ['estudiante'],
        texto: 'Para restablecer tu contraseña de la plataforma del Colegio San José, ve a la página de ingreso, haz clic en "Olvidé mi contraseña", introduce tu correo institucional y recibirás un enlace de restablecimiento.',
      },
    ];

    // Mock de procesarPdf para insertar directo (generando embeddings reales con Gemini)
    for (const td of testDocs) {
      console.log(`- Generando embeddings y guardando: "${td.nombre}"...`);
      // Dividir el texto en chunks y guardarlo
      const chunks = [td.texto]; // texto corto, entra en un solo chunk
      await dataSource.transaction(async (manager) => {
        for (let i = 0; i < chunks.length; i++) {
          const embedding = await docsService.generarEmbedding(chunks[i]);
          const doc = manager.create('Documento', {
            nombre: td.nombre,
            descripcion: td.descripcion,
            contenido: chunks[i],
            chunkIndex: i,
            totalChunks: chunks.length,
            embedding: JSON.stringify(embedding),
            pdfPath: null,
            pdfUrl: 'http://test.url/' + td.nombre + '.pdf',
            colegio: td.colegio,
            colegioNorm: td.colegio ? normalizarColegio(td.colegio) : null,
            categoria: td.categoria,
            rolesPermitidos: td.rolesPermitidos.join(','),
            activo: true,
          });
          const saved = await manager.save('Documento', doc);
          await manager.query(
            `UPDATE documentos SET embedding_vec = $1::vector WHERE id = $2`,
            [`[${embedding.join(',')}]`, saved.id],
          );
        }
      });
    }

    console.log('\n[3/5] Ejecutando matriz de validación de aislamiento de roles...');
    // Realizar consultas simulando diferentes roles
    const testCases = [
      {
        rol: 'estudiante',
        colegio: 'Colegio San José',
        query: '¿A qué hora es la entrada o ingreso?',
        esperadoIncluir: ['[TEST-RAG] Manual de Convivencia Estudiante'],
        esperadoExcluir: ['[TEST-RAG] Manual de Convivencia Docente', '[TEST-RAG] Información Financiera Padres', '[TEST-RAG] Información General Administrativo'],
      },
      {
        rol: 'docente',
        colegio: 'Colegio San José',
        query: '¿A qué hora es la entrada o ingreso?',
        esperadoIncluir: ['[TEST-RAG] Manual de Convivencia Docente'],
        esperadoExcluir: ['[TEST-RAG] Manual de Convivencia Estudiante', '[TEST-RAG] Información Financiera Padres', '[TEST-RAG] Información General Administrativo'],
      },
      {
        rol: 'padre',
        colegio: 'Colegio San José',
        query: '¿Cómo o cuándo se pagan las pensiones?',
        esperadoIncluir: ['[TEST-RAG] Información Financiera Padres'],
        esperadoExcluir: ['[TEST-RAG] Manual de Convivencia Estudiante', '[TEST-RAG] Manual de Convivencia Docente', '[TEST-RAG] Información General Administrativo'],
      },
      {
        rol: 'administrador',
        colegio: 'Colegio San José',
        query: '¿Cuándo se actualiza la plataforma?',
        esperadoIncluir: ['[TEST-RAG] Información General Administrativo'],
        esperadoExcluir: ['[TEST-RAG] Manual de Convivencia Estudiante', '[TEST-RAG] Manual de Convivencia Docente', '[TEST-RAG] Información Financiera Padres'],
      },
      {
        rol: 'estudiante',
        colegio: 'Colegio San José',
        query: 'se me olvidó la contraseña',
        esperadoIncluir: ['[TEST-RAG] Restablecimiento de Contraseña Estudiantes'],
        esperadoExcluir: ['[TEST-RAG] Manual de Convivencia Estudiante', '[TEST-RAG] Manual de Convivencia Docente', '[TEST-RAG] Información Financiera Padres'],
      },
    ];

    let testExitosos = 0;
    for (const tc of testCases) {
      console.log(`\n- Test para Rol: [${tc.rol}] | Colegio: [${tc.colegio}] | Consulta: "${tc.query}"`);
      const result = await docsService.buscarRelevantes(tc.query, tc.colegio, tc.rol, 4);
      
      const nombresEncontrados = result.documentos.map(d => d.nombre);
      console.log(`  Encontrados: [${nombresEncontrados.join(', ')}]`);

      let paso = true;
      for (const inc of tc.esperadoIncluir) {
        if (!nombresEncontrados.includes(inc)) {
          console.error(`  ❌ ERROR: Debió incluirse "${inc}"`);
          paso = false;
        }
      }
      for (const exc of tc.esperadoExcluir) {
        if (nombresEncontrados.includes(exc)) {
          console.error(`  ❌ ERROR: NO debió incluirse "${exc}" (filtrado de rol fallido)`);
          paso = false;
        }
      }

      if (paso) {
        console.log('  ✅ PASÓ (Aislamiento de Rol Correcto)');
        testExitosos++;
      }
    }

    console.log('\n[4/5] Probando scoping e insensibilidad de colegios (colegio_norm)...');
    const resultColegioIncoincidente = await docsService.buscarRelevantes(
      '¿A qué hora es la entrada?',
      'colegio san jose  ', // minúsculas + tildes ausentes + espacios extra
      'estudiante'
    );
    const nombresColegioIncoincidente = resultColegioIncoincidente.documentos.map(d => d.nombre);
    if (nombresColegioIncoincidente.includes('[TEST-RAG] Manual de Convivencia Estudiante')) {
      console.log('  ✅ PASÓ: Colegio normalizado correctamente (colegio_norm funciona)');
      testExitosos++;
    } else {
      console.error('  ❌ ERROR: Colegio no normalizado, no encontró el documento.');
    }

    const resultOtroColegio = await docsService.buscarRelevantes(
      '¿A qué hora es la entrada?',
      'Colegio Santa Fe', // Diferente colegio
      'estudiante'
    );
    const nombresOtroColegio = resultOtroColegio.documentos.map(d => d.nombre);
    if (!nombresOtroColegio.includes('[TEST-RAG] Manual de Convivencia Estudiante')) {
      console.log('  ✅ PASÓ: Scoping de colegio exitoso (no filtró documentos de otra institución)');
      testExitosos++;
    } else {
      console.error('  ❌ ERROR: El documento se filtró para una institución incorrecta.');
    }

    console.log(`\n[5/5] Resumen de Resultados: ${testExitosos}/${testCases.length + 2} pruebas pasaron.`);

    // Limpieza final de datos de prueba
    console.log('\nLimpiando documentos de prueba...');
    await dataSource.query("DELETE FROM documentos WHERE nombre LIKE '[TEST-RAG]%';");
    console.log('Listo.');

    if (testExitosos === testCases.length + 2) {
      console.log('\n===> 🌟 ¡VALIDACIÓN RAG COMPLETA AL 100% EXITOSA! 🌟 <===');
    } else {
      console.error('\n===> ❌ ALGUNAS PRUEBAS DE VALIDACIÓN FALLARON ❌ <===');
      process.exit(1);
    }

  } catch (error) {
    console.error('Error durante la validación:', error);
  } finally {
    await app.close();
  }
}

bootstrap();
