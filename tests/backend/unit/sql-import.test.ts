import { describe, expect, it } from 'vitest'
import { analyzeLegacySqlDump } from '../../../src/backend/utils/sql-import'

const sampleDump = `
CREATE TABLE \`tblusuarios\` (
  \`Id\` int NOT NULL,
  \`Codigo\` varchar(10) DEFAULT NULL,
  \`TUNombreCorto\` varchar(50) DEFAULT NULL,
  \`TUNombreLargo\` varchar(100) DEFAULT NULL,
  \`eMail\` varchar(100) DEFAULT NULL,
  \`Activo\` tinyint DEFAULT NULL,
  PRIMARY KEY (\`Id\`),
  KEY \`Codigo\` (\`Codigo\`)
) ENGINE=InnoDB;
INSERT INTO \`tblusuarios\` VALUES (1,'LUCY','Lucy','Lucía','lucy@example.com',1);

CREATE TABLE \`tblclientes\` (
  \`Id\` int NOT NULL,
  \`NroCliente\` int DEFAULT NULL,
  \`CodBarras\` varchar(20) DEFAULT NULL,
  \`DNI\` varchar(20) DEFAULT NULL,
  \`Nombre\` varchar(120) DEFAULT NULL,
  \`Nom\` varchar(80) DEFAULT NULL,
  \`Ap1\` varchar(80) DEFAULT NULL,
  \`Ap2\` varchar(80) DEFAULT NULL,
  \`Direccion\` varchar(120) DEFAULT NULL,
  \`Poblacion\` varchar(80) DEFAULT NULL,
  \`CP\` varchar(10) DEFAULT NULL,
  \`Ciudad\` varchar(80) DEFAULT NULL,
  \`Tfno\` varchar(20) DEFAULT NULL,
  \`Movil\` varchar(20) DEFAULT NULL,
  \`FechaDeNacimiento\` date DEFAULT NULL,
  \`FechaAlta\` date DEFAULT NULL,
  \`Oficiala\` varchar(10) DEFAULT NULL,
  \`Marca\` varchar(80) DEFAULT NULL,
  \`Nota\` varchar(255) DEFAULT NULL,
  \`TarifaAAplicar\` varchar(20) DEFAULT NULL,
  \`Texto9a\` varchar(20) DEFAULT NULL,
  \`Texto9b\` varchar(20) DEFAULT NULL,
  \`Texto15\` varchar(50) DEFAULT NULL,
  \`Texto25\` varchar(50) DEFAULT NULL,
  \`Texto100\` varchar(255) DEFAULT NULL,
  \`Entero1\` int DEFAULT NULL,
  \`Entero2\` int DEFAULT NULL,
  \`Obsequio\` varchar(80) DEFAULT NULL,
  \`FichFoto\` varchar(80) DEFAULT NULL,
  \`Fototipo\` varchar(20) DEFAULT NULL,
  \`Borrado\` tinyint DEFAULT NULL,
  \`Desactivado\` tinyint DEFAULT NULL,
  \`eMail\` varchar(100) DEFAULT NULL,
  \`Sexo\` tinyint DEFAULT NULL,
  \`ClaveWeb\` varchar(40) DEFAULT NULL,
  \`Perfil\` varchar(40) DEFAULT NULL,
  \`NroClienteGlobal\` int DEFAULT NULL,
  \`ActualizadoGlobal\` tinyint DEFAULT NULL,
  \`RechazaCorrespondencia\` tinyint DEFAULT NULL,
  \`RechazaSMS\` tinyint DEFAULT NULL,
  \`RechazaEmail\` tinyint DEFAULT NULL,
  \`ExcSurvey\` tinyint DEFAULT NULL,
  \`RegSurvey\` tinyint DEFAULT NULL,
  \`TCSSHA1\` varchar(60) DEFAULT NULL,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblclientes\` VALUES (10,143,'CB-143','12345678A','Clara Ruiz Calcerrada','Clara','Ruiz','Calcerrada','Calle Mayor 1','Madrid','28001','Madrid','910000000','670312806','1988-05-01','2024-01-15','LUCY','Premium','Cliente fiel','GENERAL','A1','B1','Texto15','Texto25','Texto100',7,9,'Regalo','clara.jpg','III',0,0,'clara@example.com',1,'web-143','VIP',999,1,1,0,1,0,1,'sha1-demo');

CREATE TABLE \`tbltarifa\` (
  \`Id\` int NOT NULL,
  \`Codigo\` varchar(20) DEFAULT NULL,
  \`Descripcion\` varchar(120) DEFAULT NULL,
  \`Tiempo\` int DEFAULT NULL,
  \`Precio\` decimal(10,2) DEFAULT NULL,
  \`Precio1\` decimal(10,2) DEFAULT NULL,
  \`Precio2\` decimal(10,2) DEFAULT NULL,
  \`Precio3\` decimal(10,2) DEFAULT NULL,
  \`IVA\` decimal(10,2) DEFAULT NULL,
  \`EsPack\` tinyint DEFAULT NULL,
  \`EsBonoPack\` tinyint DEFAULT NULL,
  \`UnidadesBono1\` int DEFAULT NULL,
  \`PrecioBono1\` decimal(10,2) DEFAULT NULL,
  \`NombreGrupoReservas\` varchar(80) DEFAULT NULL,
  \`NombreGrupoPantallaTactil\` varchar(80) DEFAULT NULL,
  \`NombreGrupoComisiones\` varchar(80) DEFAULT NULL,
  \`Activo\` tinyint DEFAULT NULL,
  \`PeticionProducto\` varchar(5) DEFAULT NULL,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tbltarifa\` VALUES (20,'HIDRA','Hidratación facial',60,55.00,55.00,NULL,NULL,21.00,0,1,5,240.00,'Faciales','Faciales',NULL,1,'S');

CREATE TABLE \`tblproductos\` (
  \`Id\` int NOT NULL,
  \`NroProd\` int DEFAULT NULL,
  \`CodLocal\` varchar(20) DEFAULT NULL,
  \`CodBarras\` varchar(30) DEFAULT NULL,
  \`Descripcion\` varchar(120) DEFAULT NULL,
  \`Comentario\` varchar(255) DEFAULT NULL,
  \`NombreFamilia\` varchar(80) DEFAULT NULL,
  \`Marca\` varchar(80) DEFAULT NULL,
  \`Proveedor\` varchar(80) DEFAULT NULL,
  \`IVAPVT\` decimal(10,2) DEFAULT NULL,
  \`IVACoste\` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblproductos\` VALUES (30,9001,'CREMA-01','843000000001','Crema Hidratante','Uso cabina','Cosmética','LucyLabs','Proveedor Demo',25.00,8.50);

CREATE TABLE \`tblproductoscantidades\` (
  \`Id\` int NOT NULL,
  \`NroProd\` int DEFAULT NULL,
  \`PVP1\` decimal(10,2) DEFAULT NULL,
  \`PVP2\` decimal(10,2) DEFAULT NULL,
  \`PDC\` decimal(10,2) DEFAULT NULL,
  \`Cantidad\` int DEFAULT NULL,
  \`Minimo\` int DEFAULT NULL,
  \`Maximo\` int DEFAULT NULL,
  \`Activo\` tinyint DEFAULT NULL,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblproductoscantidades\` VALUES (31,9001,29.95,NULL,9.00,12,2,20,1);

CREATE TABLE \`tblbbpa\` (
  \`Id\` int NOT NULL,
  \`Nro\` int DEFAULT NULL,
  \`NroCliente\` int DEFAULT NULL,
  \`Tipo\` char(1) DEFAULT NULL,
  \`TipoAb\` int DEFAULT NULL,
  \`Nominal\` decimal(10,2) DEFAULT NULL,
  \`Consumido\` decimal(10,2) DEFAULT NULL,
  \`Codigo\` varchar(20) DEFAULT NULL,
  \`Descripcion\` varchar(120) DEFAULT NULL,
  \`XICV\` decimal(10,2) DEFAULT NULL,
  \`XIC\` decimal(10,2) DEFAULT NULL,
  \`XI\` decimal(10,2) DEFAULT NULL,
  PRIMARY KEY (\`Id\`),
  KEY \`Codigo\` (\`Codigo\`),
  KEY \`NroCliente\` (\`NroCliente\`)
) ENGINE=InnoDB;
INSERT INTO \`tblbbpa\` VALUES (40,1001,143,'B',0,10,7,'HIDRA','Bono Hidratación',NULL,NULL,NULL);
INSERT INTO \`tblbbpa\` VALUES (41,1002,143,'A',0,0,0,NULL,'ABONO',425000,NULL,NULL);

CREATE TABLE \`tblreservas\` (
  \`Id\` int NOT NULL,
  \`NroCliente\` int DEFAULT NULL,
  \`NombreCliente\` varchar(120) DEFAULT NULL,
  \`Telefono\` varchar(20) DEFAULT NULL,
  \`CodSubSer\` varchar(20) DEFAULT NULL,
  \`Fecha\` date DEFAULT NULL,
  \`Hora\` varchar(10) DEFAULT NULL,
  \`Minutos\` int DEFAULT NULL,
  \`Cabina\` varchar(40) DEFAULT NULL,
  \`Oficial1\` varchar(10) DEFAULT NULL,
  \`Oficial2\` varchar(10) DEFAULT NULL,
  \`Status\` varchar(20) DEFAULT NULL,
  \`Comentario\` varchar(255) DEFAULT NULL,
  \`NroPack\` int DEFAULT NULL,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblreservas\` VALUES (50,143,'Clara Ruiz Calcerrada','670312806','HIDRA','2026-04-20','10:45',60,'CABINA 1','LUCY',NULL,'CONFIRMADA','Primera sesión',1001);
INSERT INTO \`tblreservas\` VALUES (51,1,'COMIDA','',NULL,'2026-04-20','12:00',30,'CABINA 2','LUCY',NULL,'BLOQUEADA','Descanso',NULL);

CREATE TABLE \`tblreservasnotas\` (
  \`Id\` int NOT NULL,
  \`Fecha\` date DEFAULT NULL,
  \`Oficial\` varchar(10) DEFAULT NULL,
  \`Nota\` varchar(255) DEFAULT NULL,
  \`Activo\` tinyint DEFAULT NULL,
  \`NroEstacion\` int DEFAULT NULL,
  \`Agenda\` varchar(20) DEFAULT NULL,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblreservasnotas\` VALUES (60,'2026-04-20','LUCY','Preparar cabina facial',1,2,'Principal');

CREATE TABLE \`tblconsentimientos\` (
  \`Id\` int NOT NULL,
  \`NroCliente\` int DEFAULT NULL,
  \`Salud\` text,
  \`Medicacion\` text,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblconsentimientos\` VALUES (70,143,'Sin patologías relevantes','Vitamina D');

CREATE TABLE \`tblfirmas\` (
  \`Id\` int NOT NULL,
  \`NroCliente\` int DEFAULT NULL,
  \`Doc\` varchar(40) DEFAULT NULL,
  \`Archivo\` varchar(80) DEFAULT NULL,
  \`NroServicio\` int DEFAULT NULL,
  \`Firma\` longtext,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblfirmas\` VALUES (80,143,'Consentimiento facial','firma.png',20,'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wn2z3sAAAAASUVORK5CYII=');

CREATE TABLE \`tblfotos\` (
  \`Id\` int NOT NULL,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblfotos\` VALUES (1);
INSERT INTO \`tblfotos\` VALUES (2);

CREATE TABLE \`tblantesydespues\` (
  \`Id\` int NOT NULL,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblantesydespues\` VALUES (1);

CREATE TABLE \`tblgalerias\` (
  \`Id\` int NOT NULL,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblgalerias\` VALUES (1);

CREATE TABLE \`tblventaslegacy\` (
  \`Id\` int NOT NULL,
  PRIMARY KEY (\`Id\`)
) ENGINE=InnoDB;
INSERT INTO \`tblventaslegacy\` VALUES (1);
`

describe('legacy SQL analyzer', () => {
  it('parses a compatible 01dat dump into Lucy preview blocks', () => {
    const analysis = analyzeLegacySqlDump(Buffer.from(sampleDump, 'utf8'), '01dat.sql')

    expect(analysis.encoding).toBe('utf8')
    expect(analysis.summary).toEqual(
      expect.objectContaining({
        professionals: 1,
        clients: 1,
        services: 1,
        products: 1,
        bonoTemplates: 1,
        clientBonos: 1,
        accountBalances: 1,
        appointments: 1,
        agendaBlocks: 1,
        agendaNotes: 1,
        consents: 1,
        signatures: 1,
        photoReferencesSkipped: 4,
        unsupportedPopulatedTables: 1
      })
    )

    expect(analysis.professionals[0]).toEqual(
      expect.objectContaining({
        code: 'LUCY',
        name: 'Lucía'
      })
    )

    expect(analysis.clients[0]).toEqual(
      expect.objectContaining({
        legacyClientNumber: '143',
        barcode: 'CB-143',
        firstName: 'Clara',
        lastName: 'Ruiz Calcerrada',
        email: 'clara@example.com',
        giftVoucher: 'Regalo',
        webKey: 'web-143',
        globalUpdated: true,
        rejectPostal: true,
        rejectEmail: true,
        isActive: true
      })
    )

    expect(analysis.services[0]).toEqual(
      expect.objectContaining({
        code: 'HIDRA',
        name: 'Hidratación facial',
        durationMinutes: 60,
        price: 55,
        isPack: true,
        requiresProduct: true
      })
    )

    expect(analysis.products[0]).toEqual(
      expect.objectContaining({
        sku: 'CREMA-01',
        stock: 12,
        price: 29.95
      })
    )

    expect(analysis.bonoTemplates[0]).toEqual(
      expect.objectContaining({
        serviceCode: 'HIDRA',
        totalSessions: 5,
        price: 240
      })
    )

    expect(analysis.clientBonos[0]).toEqual(
      expect.objectContaining({
        clientNumber: '143',
        totalSessions: 10,
        consumedSessions: 3,
        remainingSessions: 7
      })
    )

    expect(analysis.accountBalances[0]).toEqual(
      expect.objectContaining({
        clientNumber: '143',
        amount: 42.5,
        selected: true,
        kind: 'ABONO'
      })
    )

    expect(analysis.appointments[0]).toEqual(
      expect.objectContaining({
        clientName: 'Clara Ruiz Calcerrada',
        serviceCode: 'HIDRA',
        serviceName: 'Hidratación facial',
        legacyProfessionalCode: 'LUCY',
        startTime: '10:45',
        endTime: '11:45',
        selected: true
      })
    )

    expect(analysis.agendaBlocks[0]).toEqual(
      expect.objectContaining({
        date: '2026-04-20',
        startTime: '12:00',
        legacyProfessionalCode: 'LUCY',
        selected: true
      })
    )

    expect(analysis.agendaNotes[0]).toEqual(
      expect.objectContaining({
        dayKey: '2026-04-20',
        legacyProfessionalCode: 'LUCY',
        text: 'Preparar cabina facial'
      })
    )

    expect(analysis.consents[0]).toEqual(
      expect.objectContaining({
        clientNumber: '143',
        health: 'Sin patologías relevantes',
        medication: 'Vitamina D'
      })
    )

    expect(analysis.signatures[0]).toEqual(
      expect.objectContaining({
        clientNumber: '143',
        docType: 'Consentimiento facial',
        selected: true
      })
    )

    expect(analysis.photoReferencesSkipped).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tableName: 'tblfotos', rowCount: 2 }),
        expect.objectContaining({ tableName: 'tblantesydespues', rowCount: 1 }),
        expect.objectContaining({ tableName: 'tblgalerias', rowCount: 1 })
      ])
    )

    expect(analysis.unsupportedPopulatedTables).toEqual([
      expect.objectContaining({
        tableName: 'tblventaslegacy',
        rowCount: 1
      })
    ])

    expect(analysis.warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: 'account_balances_derived',
          step: 'accountBalances',
          count: 1
        }),
        expect.objectContaining({
          code: 'photo_references_skipped',
          step: 'assets',
          count: 4
        }),
        expect.objectContaining({
          code: 'unsupported_populated_tables',
          step: 'unsupported',
          count: 1
        })
      ])
    )
  })
})
