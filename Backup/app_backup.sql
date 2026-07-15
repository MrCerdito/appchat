--
-- PostgreSQL database dump
--

\restrict 9XsKpavzFfQ3MfESfk8CRo6YCDe6xuyRbXVFoh4gdhFufLC3Z2LdbiLeMV26w9q

-- Dumped from database version 16.14 (Debian 16.14-1.pgdg12+1)
-- Dumped by pg_dump version 16.14 (Debian 16.14-1.pgdg12+1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: ai_logs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ai_logs (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    "sessionId" character varying,
    colegio character varying,
    rol character varying,
    "tipoSolicitud" character varying,
    "clientName" character varying,
    pregunta text NOT NULL,
    respuesta text,
    "chunksUsados" jsonb,
    "tuvoContexto" boolean DEFAULT false NOT NULL,
    "tiempoRespuestaMs" integer,
    "tokensEstimados" integer,
    transfer boolean DEFAULT false NOT NULL,
    feedback boolean,
    "esRestringido" boolean DEFAULT false NOT NULL,
    "huboError" boolean DEFAULT false NOT NULL,
    "errorMsg" text,
    "creadoEn" timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.ai_logs OWNER TO postgres;

--
-- Name: colegios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.colegios (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nombre character varying(200) NOT NULL,
    link character varying(500) NOT NULL,
    email character varying(200)
);


ALTER TABLE public.colegios OWNER TO postgres;

--
-- Name: comunicado_eventos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.comunicado_eventos (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying(200) NOT NULL,
    tipo character varying(20) NOT NULL,
    url_destino character varying(500),
    user_agent character varying(500),
    ip character varying(50),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    comunicado_id uuid
);


ALTER TABLE public.comunicado_eventos OWNER TO postgres;

--
-- Name: comunicados; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.comunicados (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    asunto character varying(300) NOT NULL,
    cuerpo text NOT NULL,
    sender_name character varying(100) NOT NULL,
    status character varying(20) DEFAULT 'draft'::character varying NOT NULL,
    destinatarios jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    sent_at timestamp without time zone,
    total_enviados integer DEFAULT 0 NOT NULL,
    total_aperturas integer DEFAULT 0 NOT NULL,
    total_clics integer DEFAULT 0 NOT NULL,
    sender_id uuid
);


ALTER TABLE public.comunicados OWNER TO postgres;

--
-- Name: configuracion; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.configuracion (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    advisor_id uuid,
    mensaje_bienvenida text NOT NULL,
    asesor_inactividad_seg integer DEFAULT 120 NOT NULL,
    asesor_inactividad_msg text NOT NULL,
    cliente_inactividad_seg integer DEFAULT 180 NOT NULL,
    cliente_inactividad_msg text NOT NULL,
    cliente_inactividad_iters integer DEFAULT 2 NOT NULL,
    cliente_cierre_msg text NOT NULL,
    horarios jsonb DEFAULT '[]'::jsonb NOT NULL,
    horario_fuera_msg text NOT NULL,
    horarios_activos boolean DEFAULT false NOT NULL,
    whatsapp_assignment_msg text DEFAULT 'Hola, soy {{asesor}}. Ya fui asignado a tu conversacion y revisare tu caso.'::text NOT NULL,
    whatsapp_queue_msg text DEFAULT 'Te encuentras en cola. En breves momentos un asesor se comunicara contigo.'::text NOT NULL,
    whatsapp_out_of_hours_msg text DEFAULT 'Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.'::text NOT NULL,
    whatsapp_call_unavailable_msg text DEFAULT 'Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.'::text NOT NULL,
    whatsapp_quick_replies jsonb DEFAULT '["Hola, con gusto reviso tu caso.", "Dame un momento mientras valido la informacion.", "Quedo atento si necesitas algo mas."]'::jsonb NOT NULL,
    almuerzos jsonb DEFAULT '[]'::jsonb NOT NULL,
    ticket_categories jsonb DEFAULT '["Soporte tecnico", "Administrativo", "Academico", "Facturacion", "Otro"]'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    sonido_activado boolean DEFAULT true NOT NULL,
    sonido_whatsapp character varying(30) DEFAULT 'whatsapp1'::character varying NOT NULL,
    sonido_asesor character varying(30) DEFAULT 'asesor1'::character varying NOT NULL,
    sonido_cliente character varying(30) DEFAULT 'cliente1'::character varying NOT NULL,
    sonido_asignacion character varying(30) DEFAULT 'asignacion1'::character varying NOT NULL
);


ALTER TABLE public.configuracion OWNER TO postgres;

--
-- Name: documentos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.documentos (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    nombre character varying(255) NOT NULL,
    descripcion text,
    contenido text NOT NULL,
    chunk_index integer DEFAULT 0 NOT NULL,
    total_chunks integer DEFAULT 1 NOT NULL,
    embedding text,
    pdf_path text,
    pdf_url text,
    colegio text,
    categoria text,
    roles_permitidos text,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.documentos OWNER TO postgres;

--
-- Name: faqs; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.faqs (
    id integer NOT NULL,
    pregunta text NOT NULL,
    respuesta text NOT NULL,
    categoria character varying(100),
    keywords text,
    colegio_id integer,
    orden integer DEFAULT 0 NOT NULL,
    activo boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.faqs OWNER TO postgres;

--
-- Name: faqs_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.faqs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.faqs_id_seq OWNER TO postgres;

--
-- Name: faqs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.faqs_id_seq OWNED BY public.faqs.id;


--
-- Name: messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    content text NOT NULL,
    sender_type character varying(10) NOT NULL,
    sender_name text NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    read_at timestamp without time zone,
    session_id uuid
);


ALTER TABLE public.messages OWNER TO postgres;

--
-- Name: ratings; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.ratings (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    estrellas integer NOT NULL,
    comentario text,
    etiquetas jsonb DEFAULT '[]'::jsonb NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    session_id uuid
);


ALTER TABLE public.ratings OWNER TO postgres;

--
-- Name: sessions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.sessions (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    codigo character varying(20),
    client_name text NOT NULL,
    identificacion text,
    apellido text,
    rol character varying(50),
    colegio character varying(100),
    colegio_link character varying(500),
    tipo_solicitud character varying(100),
    status character varying(20) DEFAULT 'ai'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    closed_at timestamp without time zone,
    advisor_id uuid
);


ALTER TABLE public.sessions OWNER TO postgres;

--
-- Name: teams_tokens; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.teams_tokens (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    advisor_id uuid NOT NULL,
    access_token text NOT NULL,
    refresh_token text,
    expires_at bigint NOT NULL,
    account_name character varying(255),
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.teams_tokens OWNER TO postgres;

--
-- Name: tickets; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.tickets (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    codigo character varying(20) NOT NULL,
    titulo character varying(255) NOT NULL,
    descripcion text,
    status character varying(20) DEFAULT 'open'::character varying NOT NULL,
    priority character varying(20) DEFAULT 'medium'::character varying NOT NULL,
    category character varying(100),
    source_type character varying(20) NOT NULL,
    source_id character varying(64),
    conversation jsonb,
    assigned_to_name character varying(255),
    client_name character varying(255) NOT NULL,
    "clientInfo" jsonb,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    closed_at timestamp without time zone,
    assigned_to_id uuid,
    created_by_id uuid,
    closed_by_id uuid
);


ALTER TABLE public.tickets OWNER TO postgres;

--
-- Name: users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.users (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    name character varying(100) NOT NULL,
    email character varying(150) NOT NULL,
    password_hash character varying(255) NOT NULL,
    role character varying(20) DEFAULT 'advisor'::character varying NOT NULL,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    status character varying(20) DEFAULT 'offline'::character varying NOT NULL,
    active_chats integer DEFAULT 0 NOT NULL,
    refresh_token character varying(500),
    profile_photo_url character varying(500)
);


ALTER TABLE public.users OWNER TO postgres;

--
-- Name: whatsapp_chats; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_chats (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    phone character varying(100) NOT NULL,
    jid character varying(100),
    is_group boolean DEFAULT false NOT NULL,
    name character varying(120) NOT NULL,
    profile_picture_url text,
    role character varying(120) DEFAULT 'Cliente WhatsApp'::character varying NOT NULL,
    institution character varying(160) DEFAULT 'WhatsApp'::character varying NOT NULL,
    institution_url character varying(500),
    city character varying(120) DEFAULT ''::character varying NOT NULL,
    email character varying(160),
    plan character varying(120) DEFAULT 'WhatsApp'::character varying NOT NULL,
    modules jsonb DEFAULT '["Atencion"]'::jsonb NOT NULL,
    status character varying(20) DEFAULT 'waiting'::character varying NOT NULL,
    operational_status character varying(30) DEFAULT 'new'::character varying NOT NULL,
    operational_status_updated_at timestamp without time zone,
    unread_count integer DEFAULT 0 NOT NULL,
    notes jsonb DEFAULT '[]'::jsonb NOT NULL,
    tags jsonb DEFAULT '[]'::jsonb NOT NULL,
    last_message_at timestamp without time zone,
    last_client_message_at timestamp without time zone,
    assigned_at timestamp without time zone,
    assignment_mode character varying(20),
    queue_notice_sent boolean DEFAULT false NOT NULL,
    out_of_hours_notice_sent boolean DEFAULT false NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    assigned_advisor_id uuid,
    fixed_advisor_id uuid
);


ALTER TABLE public.whatsapp_chats OWNER TO postgres;

--
-- Name: whatsapp_messages; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.whatsapp_messages (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    meta_message_id character varying(255),
    body text NOT NULL,
    from_me boolean DEFAULT false NOT NULL,
    sender_name character varying(120) NOT NULL,
    participant_jid character varying(100),
    status character varying(20) DEFAULT 'delivered'::character varying NOT NULL,
    is_auto boolean DEFAULT false NOT NULL,
    type character varying(30) DEFAULT 'text'::character varying NOT NULL,
    media_id character varying(255),
    media_url text,
    mime_type character varying(120),
    file_name character varying(255),
    file_size integer,
    edited_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    chat_id uuid,
    advisor_id uuid
);


ALTER TABLE public.whatsapp_messages OWNER TO postgres;

--
-- Name: widget_config; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.widget_config (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    color character varying(20) DEFAULT '#2563eb'::character varying NOT NULL,
    posicion character varying(20) DEFAULT 'bottom-right'::character varying NOT NULL,
    forma character varying(10) DEFAULT 'circle'::character varying NOT NULL,
    tamano character varying(5) DEFAULT 'md'::character varying NOT NULL,
    icono character varying(20) DEFAULT 'chat'::character varying NOT NULL,
    texto_boton character varying(60) DEFAULT ''::character varying NOT NULL,
    mostrar_texto boolean DEFAULT false NOT NULL,
    abrir_automatico boolean DEFAULT false NOT NULL,
    delay_auto_abrir integer DEFAULT 5 NOT NULL,
    mensaje_burbuja character varying(150) DEFAULT '¿Necesitas ayuda? ¡Chatea con nosotros!'::character varying NOT NULL,
    mostrar_burbuja boolean DEFAULT true NOT NULL,
    titulo_panel character varying(100) DEFAULT 'Soporte en línea'::character varying NOT NULL,
    subtitulo_panel character varying(150) DEFAULT 'Estamos aquí para ayudarte'::character varying NOT NULL,
    chat_url character varying(255) DEFAULT 'https://ia.innovacloud.co'::character varying NOT NULL,
    chat_header_color character varying(20) DEFAULT '#1a1a1a'::character varying NOT NULL,
    chat_bg_color character varying(20) DEFAULT '#f0ede9'::character varying NOT NULL,
    chat_bubble_color character varying(20) DEFAULT '#ffffff'::character varying NOT NULL,
    chat_bubble_user_color character varying(20) DEFAULT '#1a1a1a'::character varying NOT NULL,
    chat_marca character varying(80) DEFAULT 'Soporte en línea'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.widget_config OWNER TO postgres;

--
-- Name: faqs id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.faqs ALTER COLUMN id SET DEFAULT nextval('public.faqs_id_seq'::regclass);


--
-- Data for Name: ai_logs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ai_logs (id, "sessionId", colegio, rol, "tipoSolicitud", "clientName", pregunta, respuesta, "chunksUsados", "tuvoContexto", "tiempoRespuestaMs", "tokensEstimados", transfer, feedback, "esRestringido", "huboError", "errorMsg", "creadoEn") FROM stdin;
\.


--
-- Data for Name: colegios; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.colegios (id, nombre, link, email) FROM stdin;
e219cb42-7222-430c-8a0a-1b0dc0e6887a	Innovacloud	https://innovacloud.co	info@innovacloud.co
222d936e-347c-4f7b-b571-28d91ef01686	Colegio General	#	
\.


--
-- Data for Name: comunicado_eventos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.comunicado_eventos (id, email, tipo, url_destino, user_agent, ip, created_at, comunicado_id) FROM stdin;
\.


--
-- Data for Name: comunicados; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.comunicados (id, asunto, cuerpo, sender_name, status, destinatarios, created_at, sent_at, total_enviados, total_aperturas, total_clics, sender_id) FROM stdin;
\.


--
-- Data for Name: configuracion; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.configuracion (id, advisor_id, mensaje_bienvenida, asesor_inactividad_seg, asesor_inactividad_msg, cliente_inactividad_seg, cliente_inactividad_msg, cliente_inactividad_iters, cliente_cierre_msg, horarios, horario_fuera_msg, horarios_activos, whatsapp_assignment_msg, whatsapp_queue_msg, whatsapp_out_of_hours_msg, whatsapp_call_unavailable_msg, whatsapp_quick_replies, almuerzos, ticket_categories, created_at, updated_at, sonido_activado, sonido_whatsapp, sonido_asesor, sonido_cliente, sonido_asignacion) FROM stdin;
328229ce-3c36-4f93-9d93-9dc5454402ef	\N	¡Bienvenido! ¿En qué puedo ayudarte?	300	El asesor se ha desconectado. En breve lo atenderá otro.	60	¿Sigues ahí? Escribe algo para continuar.	1	Gracias por contactarnos. Que tengas un buen día.	[{"dia": 1, "fin": "16:00", "inicio": "07:00"}, {"dia": 2, "fin": "16:00", "inicio": "07:00"}, {"dia": 3, "fin": "17:00", "inicio": "08:00"}, {"dia": 4, "fin": "16:00", "inicio": "07:00"}, {"dia": 5, "fin": "16:00", "inicio": "07:00"}]	Estamos fuera del horario de atención. Vuelve en nuestro horario habitual.	f	Hola, soy {{asesor}}. Ya fui asignado a tu conversacion y revisare tu caso.	Estás en espera. Tu solicitud será atendida en breve.	Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.	Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.	["Hola, con gusto reviso tu caso.", "Dame un momento mientras valido la informacion.", "Quedo atento si necesitas algo mas."]	[]	["Soporte tecnico", "Administrativo", "Academico", "Facturacion", "Otro"]	2026-07-08 16:36:43.275038	2026-07-09 16:17:45.30548	t	whatsapp1	asesor1	cliente1	asignacion1
a209ce37-f01d-45ef-b1d1-079f5cb36720	5f810803-c826-4dd9-9ea2-19590977020e	¡Bienvenido! ¿En qué puedo ayudarte?	120	El asesor se ha desconectado. En breve lo atenderá otro.	60	¿Sigues ahí? Escribe algo para continuar.	1	Gracias por contactarnos. Que tengas un buen día.	[{"dia": 1, "fin": "17:00", "inicio": "08:00"}, {"dia": 2, "fin": "17:00", "inicio": "08:00"}, {"dia": 3, "fin": "17:00", "inicio": "08:00"}, {"dia": 4, "fin": "17:00", "inicio": "08:00"}, {"dia": 5, "fin": "16:00", "inicio": "07:00"}]	Estamos fuera del horario de atención. Vuelve en nuestro horario habitual.	f	Hola, soy {{asesor}}. Ya fui asignado a tu conversacion y revisare tu caso.	Estás en espera. Tu solicitud será atendida en breve.	Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.	Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.	["Hola, con gusto reviso tu caso.", "Dame un momento mientras valido la informacion.", "Quedo atento si necesitas algo mas."]	[]	["Soporte tecnico", "Administrativo", "Academico", "Facturacion", "Otro"]	2026-07-08 16:36:43.087789	2026-07-09 19:00:38.981436	t	campana	campana	alerta	campana
\.


--
-- Data for Name: documentos; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.documentos (id, nombre, descripcion, contenido, chunk_index, total_chunks, embedding, pdf_path, pdf_url, colegio, categoria, roles_permitidos, activo, created_at) FROM stdin;
\.


--
-- Data for Name: faqs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.faqs (id, pregunta, respuesta, categoria, keywords, colegio_id, orden, activo, created_at, updated_at) FROM stdin;
1	¿Cómo puedo contactar a un asesor?	Puedes contactar a un asesor a través de nuestro chat en línea. Solo escribe tu consulta y un asesor te atenderá a la brevedad.	General	contactar,asesor,ayuda,humano	\N	1	t	2026-07-08 16:36:43.28231	2026-07-08 16:36:43.28231
3	¿Cómo puedo crear un ticket de soporte?	Durante tu conversación con un asesor, puedes solicitar la creación de un ticket para dar seguimiento a tu caso de manera más estructurada.	Soporte	ticket,soporte,caso,seguimiento	\N	3	t	2026-07-08 16:36:43.28231	2026-07-08 16:36:43.28231
5	Olvidé mi contraseña	Para recuperar tu contraseña, por favor realiza estos pasos desde la página de inicio de sesión de tu institución:\n\n1. Haz clic en la opción "¿Olvidaste tu contraseña?".\n2. Selecciona tu tipo de perfil: Estudiante, Docente o Familiar.\n3. Busca el usuario usando el nombre de usuario o número de identificación.\n4. Haz clic en "Buscar".\n5. El sistema enviará un enlace al correo registrado para realizar el cambio de contraseña.\n	General	\N	\N	1	t	2026-07-09 15:06:30.608307	2026-07-09 15:11:35.175641
2	¿Cuál es el horario de atención?	Gracias por contactarnos 😊. Nuestro horario de atención es de lunes a viernes, de 7:00 a.m. a 4:00 p.m. ¡Será un gusto atenderte hasta pronto!	General	horario,atencion,horas	\N	2	t	2026-07-08 16:36:43.28231	2026-07-09 15:23:37.811642
8	Problemas con autenticación o código QR	1.¿Tu inconveniente está relacionado con Google Authenticator, Microsoft Authenticator, código QR o código de 6 dígitos?\n\nActualmente, es necesario acceder a la aplicación de autenticación externa, Google Authenticator o Microsoft Authenticator, para validar el acceso. A continuación, encontrará el instructivo con los pasos a seguir:\n\nhttps://canva.link/f7x0t7g9n3w59ec\n\n2. ¿Ya instalaste la aplicación de autenticación y escaneaste el código QR, pero aún no puedes ingresar?\n\nusted ya instaló la aplicación de autenticación y escaneó el código QR o ingresó la clave única proporcionada por la plataforma para registrar su usuario. Una vez realizado este proceso, la aplicación debe generar una clave dinámica de 6 dígitos, la cual deberá utilizar para completar la autenticación e ingresar a la plataforma.\n\n3.¿Necesitas reiniciar el proceso de autenticación porque cambiaste de celular, eliminaste la app o no puedes generar el código?\n\nLe recomendamos contactar directamente a la institución para solicitar el reinicio de este proceso. De esta manera, podrá realizar nuevamente la configuración siguiendo las instrucciones detalladas en el paso a paso que le fue compartido previamente.	Authenticator	\N	\N	4	t	2026-07-09 15:18:53.625428	2026-07-09 15:19:42.987027
10	¿Necesitas que te entreguemos usuario, contraseña o credenciales de acceso?	Actualmente, la entrega de credenciales de acceso es responsabilidad exclusiva del personal de la institución. En cumplimiento de las políticas de tratamiento y protección de datos, el equipo de soporte no se encuentra autorizado para gestionar ni suministrar este tipo de información.	General	\N	\N	6	t	2026-07-09 15:22:09.36914	2026-07-09 15:30:18.259249
12	¿Deseas consultar tus notas en la plataforma?	Para visualizar tus notas en la plataforma, sigue estos pasos:\n\n1. Ingresa a la plataforma.\n2. Ve al módulo Reportes del estudiante.\n3. Selecciona Reporte consolidado de asignaturas.\n4. Aplica los filtros solicitados.\n\nDespués de realizar estos pasos, podrás visualizar tus notas.\n	Academico	\N	\N	8	t	2026-07-09 15:33:27.700238	2026-07-09 15:33:27.700238
9	¿Necesitas certificados, u otro documento académico?	Para solicitar certificados, boletines u otros documentos académicos, debe comunicarse directamente con la institución. Desde el área de soporte no estamos autorizados para entregar este tipo de documentos.	Academico	\N	\N	5	t	2026-07-09 15:21:22.809421	2026-07-09 15:36:14.238105
13	¿Quieres descargar tu boletín académico?	Para descargar tu boletín, realiza estos pasos:\n\n1. Ingresa a la plataforma.\n2. Ve al módulo Reportes.\n3. Haz clic en Mi boletín.\n4. Completa los campos de filtro solicitados.\n\nTen en cuenta que el boletín solo estará disponible cuando la institución educativa haya habilitado su publicación.	Academico	\N	\N	9	t	2026-07-09 15:36:57.221025	2026-07-09 15:36:57.221025
14	¿Cuál es el correo de soporte?	Puedes comunicarte con nuestro equipo de soporte a través del correo:\n\nsoporte@innovacloud.co\n	General	\N	\N	10	t	2026-07-09 15:38:20.251073	2026-07-09 15:38:20.251073
11	¿Deseas descargar la aplicación móvil de la plataforma?	\n📱 Si deseas descargar el aplicativo de Control Académic puedes hacerlo desde los siguientes enlaces oficiales:\n\n- Android / Play Store: Control Academic en Google Play\n\nhttps://play.google.com/store/apps/details?id=com.cloudtechnologys.controlacademic.app&pcampaignid=web_share\n\n- iOS / App Store: Control Academic en App Store\n\nhttps://apps.apple.com/co/app/control-academic/id6483931371\n\n\n📱 Si deseas descargar el aplicativo de Sian365 puedes hacerlo desde los siguientes enlaces oficiales:\n\n- Android / Play Store: Sian365 en Google Play\n\nhttps://play.google.com/store/apps/details?id=com.cloudtechnologys.sian365.app&pcampaignid=web_share\n\n\n- iOS / App Store: Sian365 en App Store\n\nhttps://apps.apple.com/co/app/sian365/id6741000728	APP	\N	\N	7	t	2026-07-09 15:31:53.900133	2026-07-09 15:48:48.140528
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.messages (id, content, sender_type, sender_name, created_at, read_at, session_id) FROM stdin;
6121f586-fbd5-4215-a3eb-293a3fb81bd6	enc:v2:vlPx6XlkYKV3lqcIHu5RKzbByQjkQz49blvLml3BjXA=:qh/2ISyF8o+5Fe5u:dopxxEAwy1U2ks+n7JIejQ==:LSFrbX39xDpDixo+aAQvU+ZZUDnoie1BF0ZluB3Cw6BL9mWcyJNO	advisor	enc:v2:xTinpPgJ2Kt2ptUlEWWQAnrYMHP5X3glf9jGBpx3Gqw=:C15lmtTHI9covF7j:Wfb12lbuxT/7rIuJAeIivQ==:u9eNqcbjF74Qzguh	2026-07-08 16:43:53.731308	2026-07-08 16:43:54.108	7fae884b-c57c-4d5e-b5fc-8aa987e5286c
85389a23-3eb8-46be-8619-2d30b7c6f41c	enc:v2:nA4Bn75+MvOiv8960fSxp9h6KdByl4GSAI46qw9j7JU=:5M65vGbDHyhxkO9d:cWT1rtblwu0cIpifEyNsyg==:OGmxqA==	advisor	enc:v2:W+9RRpJ6GjbHmeaOKVWDDWLLsvZN5GGY53y44vLQdXI=:PrWxhU7YIR67DJjL:yBr0JDS5ynbxJH+S/MqLtg==:8aKQwCpSgMz5I9sG	2026-07-08 16:43:59.007775	2026-07-08 16:43:59.519	7fae884b-c57c-4d5e-b5fc-8aa987e5286c
5bd4228a-ba60-4005-abfe-8286d9721003	enc:v2:nnJQ2JcP4AUzhAugPsBd8GZjKY4P29C//mnLYhfZAf0=:5Pu5619jjflSHD68:w//tHbCRRbKUO+zIS5kbeA==:MLoYYA==	client	enc:v2:MZsXqeyd9W03gPtkedq/ADtFFhyEtXmf6EduOKC0LiE=:4EugRcmd/AMnsVkR:xGET65dlyzwZlCJIf4x/hQ==:GhyIJw==	2026-07-08 16:44:00.950292	2026-07-08 16:44:01.399	7fae884b-c57c-4d5e-b5fc-8aa987e5286c
4df54d5e-1ccf-40fe-b78a-693bcdb9ca39	enc:v2:wzb8kJe/ixFjklwlOc5uLOBoeE4Bh6TUP0jL2AgD9EA=:aZ3fsXpDq8A8yAyF:+Ck4quwkUT0Uk/sMu5Qs5g==:xoh303hlVI+wC5OebQK8zm+DQLSCr5n0Qqc8qWAgx+rbqTDzKgH5	advisor	enc:v2:b73+I6l6kni11K5OvPgJmRoKWhexPseWlLY97PwlTKw=:cMmCCPCTZEs02tYz:7Y5u5pbgF8Mfz4VP5bg78w==:yPgOVNLB55Zzz74J	2026-07-08 16:51:29.139276	2026-07-08 16:51:29.511	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
aaab0c49-0cd7-4d64-9800-90bca64d8675	enc:v2:ytgsnQR3bj5IPeXpomeW810Ypd8P5dYA0VPCEcMqmqc=:+I37LegN45+MpF0E:+lyLL+zcTLSYKPYakt/3TQ==:5GfdeLj03iSswgqSXcao	advisor	enc:v2:8Lg7++oGmT6fWZvmzdO5w2gzwZZWcDA9dpq1nHH1uwk=:K4pDSx9srO3ipVVY:gZ7dxXy+n9ybUBLr/6UMHw==:JK/11hsCo5emz0Lt	2026-07-08 16:51:38.287194	2026-07-08 16:51:38.757	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
f7109537-6655-4097-8ca4-53b0cfe2ed9e	enc:v2:ESLnNhdwbmbmyPq2l6h69MuGU3crZ/KlBB3cDSo0SlA=:U6IP9KgpMiqF5v1r:b0ID9akZ6rs8iVedsbcM+w==:3QV0vCjV+/idkMc=	advisor	enc:v2:oPEZQpbbfGCWAPkFBMVJ0r9MSgNae9kkbOhdnxNdDOI=:gEq7xMXazCAcMizA:jPCIgrp9DlJB6qQM+4gm0A==:7Wqqk6GrqB+yIURN	2026-07-08 16:51:42.864029	2026-07-08 16:51:43.32	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
fd3760ac-badb-495a-8e9b-daa06c88febe	enc:v2:xMGEJGeyEuRtGy7f2TeunIwiwhYszZqZMNeOUmsxoTs=:QH+mZbI9plIsUTbl:bEeJznAt0zijQBrI5dwVCQ==:bWsPZHAQ	advisor	enc:v2:hsoGMvqO0LjHGXMoQ937wF8nQoYL5DxT0hhzpoQUkiY=:Yfkuu0fxaNiJJs3E:8ZdiqLHFqRB5/MSHLymH1Q==:pWAxclWqF4ZFxxs1	2026-07-08 16:51:44.750728	2026-07-08 16:51:45.184	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
17cfe464-7271-43a5-98d7-4b00e9b33b7a	enc:v2:qB7C9+6pQHqKfVfGvC6pv5BNdfNt3CfHpPSbYz2hzQc=:TJERk0rg2B4obFVU:PfGf23uH0iLDLL5BuXRP9Q==:OI3RPgvEQw==	advisor	enc:v2:M9eOYFmXPPunlZ11rWwj44bPY1ztQvEuP2P6D9UtGqE=:UNY8wDAER9JP1pAm:T6BtkxaTI7HEYI3NckPAyw==:SUwNfZHw6sMZ/ztC	2026-07-08 16:51:45.519348	2026-07-08 16:51:45.961	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
738d4539-cb77-47ec-8159-5f13211a940f	enc:v2:GtR2gQs0V6wqDIDXYF4LjU6tXJ7n1M1TXOboBU20zNE=:DHYe3Is1lweRzm79:0JkEcHdU8CL3rCEJBEwVrw==:8yQ6	advisor	enc:v2:qRpkDL//RwIeIxqBx/n7E0qdp0igYugPh4PlK9bHkvw=:9GnLvr2eId2h1vFc:abOSt9JM/KENtjj++Y5n/g==:RzzB5NLtcrmtlRzo	2026-07-08 16:51:45.703035	2026-07-08 16:51:45.961	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
5c7f6ce7-caa8-45b2-a49d-17600701ca4c	enc:v2:mzHaEQ/qsOpYHzbNSMT9eldiH3mYaK0Z/D+QBrXGZ9w=:gJykxEOPAZvrWjPs:vBeNazn/boi0Snu+xgHJDg==:Dh0=	advisor	enc:v2:5PRtRwwwJlUC0RlrwWOodmvqpOOvSUpwCAITybm1stE=:zKYcEKiI5cfA2LMe:seHIhU7DdfZeT3g7SPQ4SQ==:tunwD4Zac1vg8qBY	2026-07-08 16:51:45.783003	2026-07-08 16:51:45.961	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
16c96a94-a163-4afa-b095-d8d1db635233	enc:v2:RxeDRzh8b+JFSEn52p0I7I8JnNVyf8aSqyisYEBaCfU=:mPlQuSoNygvud0YP:4yVTOdaDJNAB1FGxbv3/vQ==:Cw==	advisor	enc:v2:SVcQs+oUFPBAGXrrz+29hG784bl1lv7BlDjkK6wGiIs=:F0guI7n2Am/ddmvP:Sxv8OuLgoQyMKuCvRCf/Mg==:qNYyiery/0UoLlDP	2026-07-08 16:51:45.90967	2026-07-08 16:51:46.249	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
0adbe26f-1186-4543-9b0e-80a89c638c65	enc:v2:GtXYlwIVhaPdGh6Ca9Zxlqp1iFLfel9o6H6SaqBIA5w=:tyZU14KyRoGCGfn4:HdNCkWnr/fCjdQd95BkFOg==:RIE=	advisor	enc:v2:CfgLDUi4OWDoP4Cppqc8zDcxiuA7w1kBlN4/oSiJbAA=:U2yzFcYtt/hzMzGD:VSv1PVso+Gzc6OyzC0slsw==:ErSUgouvjlqp49eL	2026-07-08 16:51:46.103484	2026-07-08 16:51:46.249	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
53e4942a-4c5e-4974-bde6-38b05d814658	enc:v2:K8ImO8JwFtN5jHUqpU/kU5L39Wc0qRawcFAZ4PbvYmM=:PygDEiNUgzPUJ+dj:B/2SirvU0c+QnXiwgWmERQ==:h5xtMCXM	advisor	enc:v2:Cq9PSrV/hTKQTNUI+uI8WZyqTHDTCSKUwLAkMwXQaq4=:dx3wyVfyBVvk+ES6:3XR3WOSS7ZhPCZG7Lpcf7w==:eOAk2v7+6MfSR0K+	2026-07-08 16:51:46.19744	2026-07-08 16:51:46.314	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
5aa01af3-62cc-486b-8d04-e75397e598f8	enc:v2:HNh7mynfHs10D4BI4L/e732L59PFfWpyXobyaGMnuAc=:ITJkwu7pmbrhGNN7:K/2Tcw4cEGE6fbL871Us/A==:56A=	advisor	enc:v2:TvoTPvxR0/u3afchcNoG5aqOcxSKXn9tYZAS/9KWxHo=:aOrv6kn7s642ZYgn:DqNOu/C8Z5DCFUAbPqCndQ==:gDhfgQPZ1jVSWKDL	2026-07-08 16:51:46.343189	2026-07-08 16:51:46.565	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
305af8a7-44de-4922-8660-0b05b156d4e3	enc:v2:YZIf2loDuMyqf7FS9NAbhvIxebuoyo5iyK8y7FnfCxc=:XTjMH9bfRLO2bDAt:93dNtK5Q3zOiJ0+PHcDPFw==:DeNeFQ==	advisor	enc:v2:bQXwHO+UDrKiZsArEc94QixuMYdO4Qg/+Z24MQ+vuiM=:K8SJM9DIFzGGw8WX:9v6fDZpzTgaH1NZ3AqoyJQ==:Tj409atJx+DG1QOU	2026-07-08 16:51:46.480026	2026-07-08 16:51:46.565	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
a4e8ea09-a6d3-426d-96f6-40f1d1f3e8c4	enc:v2:j/hN7kpKF9bqqOX/Q89+StgHznkwjo7dR72LLBrsS4U=:bvPP9Jz/+1MKS4Qd:p2LoYYu1qJjwRo19bhYq0g==:VlX+	advisor	enc:v2:U6CTieB+7rCqGPbW5InTl/8pt3OJzdww9E0tvKC3VG0=:4DPNq+w69CSZ2a7N:pA4Wl6cfjWiCsUJVjaxXuA==:fyXHOnEbaO8Yr2JE	2026-07-08 16:51:46.614444	2026-07-08 16:51:46.842	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
335249d6-f876-48da-9b31-b68d3ce2c46a	enc:v2:/+xeOiRkaw+hJy8jMFXCenp5p/ijwbdACfhzP1ypgkY=:FhJWFNGUmY4VWsu5:M3MHDRLQxa6+BStERymxaQ==:nwTu	advisor	enc:v2:JrtYsM2RZZGCUb2x0H8A8fk9COZ+b2kJYztxrRpkZQY=:eBVHUmAPMxcp/3IQ:LvZh89qOeFVXn8NZVfQr6g==:rNffFzQtKL5ndPtE	2026-07-08 16:51:46.750709	2026-07-08 16:51:46.842	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
d0cdceda-4d59-41f8-8ea8-c5ce5327616e	enc:v2:RRw36b/7Til8maTmZRYrr500EoFDo3pQsL9NHE7EfCc=:rO1PNCjWT8OOe9bT:3MfNj6q+4zkC11gwyWfJPQ==:QvY=	advisor	enc:v2:k0FFFgNEeZoW7kFrq8Py2djMU3eo0GXzygkwdzv8TKM=:Kmuk0BMMc7BbAytm:BNjR2jF/tdOtmMFIfKkVdQ==:Zz3rZpyHFa7esQnk	2026-07-08 16:51:46.869798	2026-07-08 16:51:46.959	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
a68e4310-8c38-4ca2-bad4-db2bb805c676	enc:v2:rbEQt1rojVtvvn9P51D4x7mEGF7MJ05H3ahrkgGzr2A=:JiSqtNVmBy9sMbvC:a/uWTAPNB1ftKPw+x+rlvQ==:zR/q	advisor	enc:v2:ZkQu00WzTc4tcDgBsCNFnv5m4ntsYkX9ceLE5OXcxGA=:YMoJKChzfzJWsKzM:/GT99FHzgixGR+LYoLJy6w==:KdG441xLFWzJGJa5	2026-07-08 16:51:46.999465	2026-07-08 16:51:47.066	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
d909fb29-2c8d-4cb9-a03c-633d2963ce00	enc:v2:yyWhy4eFUXXPf5nPfUEgJDse59WMej6uvhY5Za9MfOc=:zkaP//Jv4nOD/RWS:KGeuedtwfHdPUpCPMjhvwg==:RA==	advisor	enc:v2:OJ39Fn6tBnGNHlnwjRpJQEUgjVSj8rDEdKbIx/tPgT4=:BJMQtbHonGCpVLNQ:+mqlIUbTKolEC7g6tns0+A==:lnHcoNNGGFwNssK9	2026-07-08 16:51:47.178372	2026-07-08 16:51:47.236	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
34e7e5f1-d658-4c5a-a042-6372c8aac6da	enc:v2:vXPMML36UvtdY/Vfzf+2nQ1jqyuL6PK7yJZOivcaqzs=:M5Ye1mfVRKSZyBVt:T4TQ5c/vo6beB51DZCt+cg==:eznH	advisor	enc:v2:SK0HqwiBpVyIckLfzqiRUYc+scwq3wjeFhGKc0C8hAc=:7BTDyPOEQ0fQ0j45:LMJl05eiAIgZ1x4PTLPGXg==:BN0zGG3/ZBSaXWz0	2026-07-08 16:51:47.262012	2026-07-08 16:51:47.44	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
b984d4dc-8439-4b65-8806-bd3c185b0b96	enc:v2:2233oC9mYbP4r82Uiux6xPj5fMDaKuxV5Jbbj91TjoU=:qlZfY37O+xMSz8uK:cd906+ZQOp1YsNakr+YpPg==:GaZ7	advisor	enc:v2:aY6+x3c8XiVw8lS+E+L7eoCaWVsemhgYQ/e0pYPw1Ag=:Cm5plhr8xCCANgnO:TCFOxqawIfzP1i1FHKAJsQ==:4k6bgYWrS7UTZY9m	2026-07-08 16:51:47.388649	2026-07-08 16:51:47.639	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
1bd0d47d-9328-4ea0-a05b-980627158126	enc:v2:uKKvRIiX2oBtD2YVZ649Nn63qH+dnTkTYgSjTG4gzwg=:8Cvl4goBJtf5d9Yu:inLcMr5LD0rUZyLPUTG/aA==:KF1JudRk7p5L+SCstJt3BJZVQCisB1xXydPJnnyYKVtWD62nny0VfQAqh47I5UWIzR2CGrINDL+CcKHgoFx9W+mKFsm0/L4Z4VEyiseRZb6m//kJQw==	advisor	enc:v2:3Tcp0eogRHpvLSYxU/QZosNOapN+i9bkcOv2O4sDeWs=:JvpinZCyn+6PugkO:RsQnw2ij8YJd8NDOLUa5SQ==:rOSORejQPnA1YC2c	2026-07-08 16:51:57.732089	2026-07-08 16:51:58.165	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
872d8b96-b984-4e46-b469-cfd56731a6bc	enc:v2:7PiLZ0qkwdQO3OmeP88kd0m0SujR9Gu5GNj1HgHi4NE=:SDNVC+8KRF0a/eRi:+7Xr92SOcRrlsdUtCTZb2A==:QNiw9lp3DDAyHZkwAk4m9rzHuADN645Xop1j9hRh/qdh5xfViFmke3mgiQ==	advisor	enc:v2:0KSE+nvWWCTBUFM61oaxZCCFi/5O4gM020kwvqMpMwE=:y6h5U892xM1h+EMg:8ok+SUWVwEpkc9S5NDMvoA==:BKQQ1M9NRA==	2026-07-08 16:54:57.872341	2026-07-08 16:54:58.33	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
e1fb94fa-f141-4a1a-bc16-5e854ccbf7c0	enc:v2:PrSjcPzdh3HnxKo1iiYutuAmZpTHuNJIOc1fyGspCiE=:y5YmMXCAZ/I3S0Jc:4qA+CyCM1rfyj1iDpa7jFQ==:Wq+FN+s6stk+dr3adCh/1cp0Xg2wofFBDkx0TPL8vymZS9p4A3vpHEw+Go+voWMPYjM=	advisor	enc:v2:0tO1G4LCaONDn/YIv3mlItAgs1qM/D0XxPPlGk2ivVY=:0qbB+a6w8a3G8fCN:CR58fw+c60348XC+Q8oZrQ==:v69Fv/2HRA==	2026-07-08 16:55:58.011344	2026-07-08 16:55:58.443	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
534fe7dd-dd96-4527-848f-3422e333b1a7	enc:v2:Jkn0HKW2RiKBRCZFNZ7BOKIWaJHuykJpu6khSZPv/Po=:B6xwnob/q2OK5SJ3:Cu243otg/26FdeKhNzf/kg==:MX1WvAmZKtVYJ4m8OoOovY70VP8a0Uh0bKTSrcnC4dn3MZ8f9y4C	advisor	enc:v2:gEQzavRW91MtaK5Ny0hfPNCiOkWd5zbPgza/ABlccvc=:IDMs6SsdT1LPIDYL:84jbFZRw/0ncNR/tr1b1BA==:N52s8gKXS5RZraqk	2026-07-08 17:36:59.042419	2026-07-08 17:36:59.37	50cf4950-2da3-47aa-a981-a509eb37550a
ea36b0d1-0835-4ec2-a538-41129671e7ba	enc:v2:g3nHtDXR4LV+A4Daa+ts5/7uepQDnHzyJHGjeas5N0c=:1MomXEx/iaJhIhq7:SZyC/No434sFFYiHlLy4eA==:gWAb	advisor	enc:v2:gg6e1yo9m9cIf4Fzj636mDVmiXU4MOsOgtggWTyMEzA=:2W8cOmP/IsQRVk29:WlSEiflk2+ON5euUufKxcg==:3rGWGXYxIJ+ICacA	2026-07-08 17:37:03.926268	2026-07-08 17:37:04.292	50cf4950-2da3-47aa-a981-a509eb37550a
9c701b9b-8399-4f00-9e8d-2e6e7951d520	enc:v2:h6ZTJGm+XoJ8Q0eC+plUjTRyNBSKnLV0tih5cHdcIr4=:HBJaKCwC9oNcv1qe:FSnua7T3QMQ42z2pptMYDQ==:1J8AFg==	client	enc:v2:hpas+9vvMnZT/3Fvf3rc2h7VblqF2K0z1bAnnmQUdRA=:EX2G12GSoiQYPsCO:DZraIIsaGvgTaXqadhv83A==:VCQFpKPaxw==	2026-07-08 17:37:05.472925	2026-07-08 17:37:06.001	50cf4950-2da3-47aa-a981-a509eb37550a
155b61df-774d-42b0-a7e6-a1738ca72cfa	enc:v2:aYjaVDUX6UPIN/DoT5q6ls3GuATHkKuZ2t38P644JEI=:UeGMBDQ4yyt89KTh:N2ASjX0lGfBzcaD+04AUDg==:V1cNPDfpLmkVpw==	client	enc:v2:ClqLeivH/TfGIBc47vLIico0M/Ysje3oaGeA0XAQKs4=:ueJJMR4lOJpreLnA:g9NsGlKVVRQBJVDFMJGB+A==:NYwayZQkYA==	2026-07-08 17:37:09.805796	2026-07-08 17:37:10.249	50cf4950-2da3-47aa-a981-a509eb37550a
507b1dfd-be1d-48af-bc45-a42139423201	enc:v2:J+I/D2w4HaydJ5IDrhsWZ9Lu8hFbb6tJ9rFHkaNbeY8=:z4PS4gy72v8PlqVr:Hvhv2Z0ckJLNQgiqGIlffw==:ygiziw==	client	enc:v2:atugjY4z1aW6vc0WxOaKQf3MXL7BEivgmbjmkTmLUnY=:pq9JrOpTUn4OFUxh:Ifn8HO+bw3xteZa0FYNbDA==:i0qeqUX6qA==	2026-07-08 17:37:14.210199	2026-07-08 17:37:14.639	50cf4950-2da3-47aa-a981-a509eb37550a
e2234250-d2bf-4418-96e9-cc5489a9be01	enc:v2:/HBbo+fmmnc4aPtv0AR+eW8JSKB3gvIQZ1kQc6IP2+s=:GwyYZrwMuoy4zGjB:12ZG3LJIcFdStNNZCRq2AQ==:3KSdK324aw==	client	enc:v2:y4LUG43kQXSL8m7wa+bM1KNvXXOWuPQsE6yC+CGqKgI=:eGFfgABQ8Bn4zVTc:iUQZXuOnsq52kom67fnJuA==:fUHpkGw3vA==	2026-07-08 17:37:26.562936	2026-07-08 17:37:42.833	50cf4950-2da3-47aa-a981-a509eb37550a
613159d7-9b21-4453-8232-3796ce36ec28	enc:v2:lSX4tvSkvXWTbNpgJUW0QlV1a93L0Exwx7M+2Jtr27s=:pAal2G+tYlHnpF2Z:eY41kg0UnUQoqoZp/3K1cQ==:y9dvkA==	client	enc:v2:u+7mm1eIeblVRshC4OpBCov6X5Os2yxGDg8nZ0rwrPs=:Lvu5LCkAD1wEIBjk:oZsaskEGRN2Cu/kxjnPypQ==:LHmM3n8Ehw==	2026-07-08 17:37:35.421022	2026-07-08 17:37:42.833	50cf4950-2da3-47aa-a981-a509eb37550a
f06c94fd-4596-43e6-8322-84133202a398	enc:v2:o2MNbtju5In2EphZPfN942i7vgT3jeKPVPeCmy3htKU=:VHWr1l/DJXWPabme:BJ955FmwjPdGMAFvPj43UQ==:GlVtZA==	client	enc:v2:AOLh4omcbt3OHUWvVilqmFwlcldmZgk6FXhPqF8OB20=:gksx7k+8mByWWL9b:4ZsGuedMruSkISgJS1LznA==:P5p+dG7j6g==	2026-07-08 17:37:39.422486	2026-07-08 17:37:42.833	50cf4950-2da3-47aa-a981-a509eb37550a
41036e10-79d4-42cc-8724-83af4caafb70	enc:v2:UrrzS++/lGQV38Ym9NCNGZshKvmVezwTh+41HrCNWdM=:tcowogsjmnUO16jA:oxO6d3zW6ZY1zvbP9t1IhA==:taxsqA==	advisor	enc:v2:iq7FXA/i5k3IvfP+Yi8K1LbLcq9dycOSw4S79hNndAk=:TbqluQ3k6//l7lBq:fT2LkUbphxbubsfaHmNqnA==:d8En9c3YYSUnW/3k	2026-07-08 17:37:46.117968	2026-07-08 17:37:46.49	50cf4950-2da3-47aa-a981-a509eb37550a
56c162b8-bcfb-45c0-8d55-378086cfd156	enc:v2:gqYdL9VFrsrDYFX/eyhC1PLeNmQUw7nfIp3Rmdrj7LA=:IM+WVrfPbZCCa8T3:4TpUxkHaNNfcmyo4gBiT+g==:fi4=	advisor	enc:v2:sCxUjGzIPi86l+H/mGfxLMo25DnjDMFnA/zOGeeVllg=:MSYtPM2g20a+6+n+:y+Ux/tgJbnS6f0vgGEdoHg==:4pS2i4jJui1wgApB	2026-07-08 17:37:47.597307	2026-07-08 17:37:47.984	50cf4950-2da3-47aa-a981-a509eb37550a
7957a4f2-848c-4bd7-a914-050ea384cfeb	enc:v2:aIHuyLFK96Tbq3aBnaiNvbM8Hvm6mqxjPmaAyoUQ7vY=:xKfqKZQ4R+Wm27+/:UsO86D9VshyFIrHlkEee8g==:uuk=	advisor	enc:v2:b0FKNM8N0yd0Dut+DlzgI9xaK2tby+aaPOYCOF5BbBU=:W2zC7MjhtiN+uLJt:ltBRiWE8cxzfqqvG6lCyyQ==:/C06uGSIHeBOCGug	2026-07-08 17:37:50.503912	2026-07-08 17:37:50.89	50cf4950-2da3-47aa-a981-a509eb37550a
c2337f05-9273-4ef3-ac10-b2025b7f8bdd	enc:v2:lawVvroHIJvMj16FnkNz6O0jL3FmVjGOv8HEVvGRKLU=:LtNSM6jO3uawp/17:UTC8yDNXIBHBCVHyfbZD0w==:uDmf	advisor	enc:v2:j/eQe6C5F6Za6zX7q+KGY7aGT6ga0OEMt2MGyw5i0+0=:uCnCTsPF/XUKkOCA:KRAx2PdGOyCtECzCTXKXxQ==:9lu0o8htZem7FTRf	2026-07-08 17:38:19.143763	2026-07-08 17:38:25.024	50cf4950-2da3-47aa-a981-a509eb37550a
82e9b495-07ee-4eeb-9bc6-a1fe89c1acf6	enc:v2:+3C3XxDQOzH/W02AZod/LpcPWrm7BFcja1QIj67nzb8=:CdikkgnRshGd+L59:yJUmAiUw8KKFc+6psg46hA==:OMxejszhtVD+1nWH6/9GJi9OomNagSv8/MdPaOLY1UTiRPPFFSIb4QYXdw==	advisor	enc:v2:DJOPQ82+IoENIDz1Vlb27Ok/mxMXcymHI+EXdNkMbak=:AEqA4WFpxOwk+b0q:5OvACEBV6NvkI9oeT5Hzhg==:N/maQMMKTQ==	2026-07-08 17:39:19.289572	2026-07-08 17:39:57.157	50cf4950-2da3-47aa-a981-a509eb37550a
40f3de7b-f23f-4a92-a992-1bede4d2111e	enc:v2:LexGDt8kIp/V5Oe7V1EbU/k1JHg+jl0+mh//Ei4hF1M=:BJ6OpBDSs9ovya20:0+xH3OnIu0q2piPF7r/obA==:aZUIEdU/jExP/UfZ5lqAX/tritp/GTeaGsv0Js9IzSmHd+P0497wMTLwRlPOGdAJyCg=	advisor	enc:v2:zrfCtGgVTFMF00HzywsC/9oS6ssMT+g3lr8c7RJDFqQ=:jiIPUfSdenw8dYb8:nl3SuaM5pw41x6cvfDBvVA==:jx0GhU+5Qw==	2026-07-08 17:40:19.438245	2026-07-08 17:40:19.855	50cf4950-2da3-47aa-a981-a509eb37550a
57ac4e7d-a50f-4ce4-883c-47a9e107b158	enc:v2:OS0WY1Ft+2NDs5rtW0BMp1JkCenegWVeXKTXvqXo/mg=:egp9lGdU/kQ1+UmP:+vm+QFRDhu0nWzW85md4bg==:bFlDrTWQ5pd97spJS0GApEkiqJbH6GasjsCspwbS+zPQ9o88xg1j	advisor	enc:v2:yj4T65pYteZJKw9jMZ1nfjzsOjcImgk7O8t2dpE+T2o=:euwZGnvqUmHXJUBb:Rv+TFC6TgHxebh25/9mFMw==:Z663YvgqrRYKdPyX	2026-07-08 18:50:05.066256	2026-07-08 18:50:06.164	73d46a8c-eb49-4089-84bd-e2bad2b13179
d7faa166-7411-4b94-a97d-e0f292bcb1fe	enc:v2:HACLgGduEZCC8k564BuAaxlzlK32MMeNL0oMgB8Y1NM=:d0Qco0W1CQv36jch:W6tLAoXjdWbos3gd8HIzAQ==:ZTgMrQWky/RrcKZ7ld0AgmzoAOXVFeWmC2NCvWv1vLBYuVGJRm9k	advisor	enc:v2:vzZDQEm7p3+ZvQ5isuyORMgEivmLiU3WvqvcQsLvHNc=:+mUTqEfizK9lvcGk:T0NgYcsCWv8gOt/vNI6XlQ==:BkK/WO0sGZMIHKvq	2026-07-08 21:04:02.557795	2026-07-08 21:04:02.951	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
54147e99-8789-4a41-a276-458ac2a3d717	enc:v2:7ske4MPONURyujstzB3ryTZfdQQGo2sIS6t9YtR5y0Q=:Re/QpqzkhwmrB3oU:tgvP0uB5n1cKBAMQb34OAA==:T4l2Ig==	client	enc:v2:PzJY+D6KZPDauiDYMT/MNQWQS6gTqZ+LrjXMCcWYTeI=:Kj1e8fQhPZ9xiuD0:gEKQ1nn5Bb2oJIzlNzgdUg==:Kqofo+xZ	2026-07-08 21:04:08.494387	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
251f43ba-c7d2-4f37-9d77-67c9c3653e6e	enc:v2:d4sQHeAfSJu6YThDXxwHz7TrIifYLaobQPhOXJRoTOQ=:T9aTGUX9Qony8xJ8:1eARs8FJevqGkgWLdE3Gjw==:vXmYFg==	client	enc:v2:V9yLLQB7nSZwviyd785zbUbQDg2GV2WcVolv/0Di3UY=:bGrhckRtoDWbVgjD:n/l/pHZ8nnWZIp4GfN4bhw==:u1VJp2y6	2026-07-08 21:04:10.055382	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
0a0abacc-76a1-413f-b555-71b6acb5c0f7	enc:v2:XJjIy7WDLydsDbteMMZHQHdFaNGtiZWCF5SFXhT5Ycc=:M+OdrRHHCmbhZTIc:whGeEb51n/NY/eY20Im/TQ==:IfxTdQ==	client	enc:v2:FFcDkcdwbbReNfMuJv0o87E+13e5HknkJh3mApZkSII=:5Kq/rzxCDIOqFGnw:7y/XzEME6YSkC8RfQG0+WQ==:gOjo5Oww	2026-07-08 21:04:12.445992	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
71a1da65-ee4a-4a19-896a-215f6f5647ee	enc:v2:eCoeK5Ey1ocH/3I98N9aI0snnh7We16yTrlxja1xqBk=:9j77IbqIBA9AxraW:ehx8/vE3GgAwQ0xRaoHLsg==:/g==	advisor	enc:v2:lkU7v5atqhGgygeV43mYcm/dRFE+Dso5OxI4dtMeNUY=:i9kjp6p4Q4hCiK4G:hUsz8Ketfu9MDHIwGvE9yA==:B3ckQzFef6i0r0CT	2026-07-08 21:06:37.092383	2026-07-08 21:06:39.55	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
c4d7ed18-4254-4161-952e-6d5d40fc56bc	enc:v2:eyvpBg1fnYDETYlSui+oGo0bQTi9sZ7m8nhMu1qYuTo=:QHImG9HoSWxQthqG:VhJHOojVNJjivJJsAdnWVw==:Vw==	advisor	enc:v2:Vl8qYF77utMe53r3Tm7zlU31c56wfI6cdFAxd+Hm5VA=:Js72GCcV8rtWDUyS:8XqAH8k69GANtf3GpWGAFQ==:oFlUabRFI4gkH50J	2026-07-08 21:06:37.268433	2026-07-08 21:06:39.55	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
6be02a49-f31e-454e-a626-00b9a84076d2	enc:v2:JWjesdVVIxvqZuER97SAaZud1sSAB8ILXDhZ2TVuqxo=:oRIkYzJmrjzz+Ird:qqQYLd1TmHcDwC43Y85ePg==:8g==	advisor	enc:v2:1k4cL1ztI5uJ83DRRwVuX0R3TK8vXCcBVDt24CgiBag=:4fvto9uPM2nVkpMz:ECWRp3Ctvj2UIKXpvZ4/UQ==:mHxVrpmugVZl4Jso	2026-07-08 21:06:37.430535	2026-07-08 21:06:39.55	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
416d656f-5f5f-46ae-b984-7f201d2cf031	enc:v2:ekPXCI2mNFyd2Erwjq3v/xSp5Xx63HytWzhH/ELJxGw=:eZJHHRpZ6BWFz9QK:QdSZlwiRkfR2rWhm6wamSg==:0A==	advisor	enc:v2:B/74FO903gg4+sB6Z0kurVFQ+i/qYFSaBSRjxvFEnZw=:vefCh8o3XEIU6IOT:40uwBxdfn4iFylWiV5lwRw==:tfzCPmBGRElORpR9	2026-07-08 21:06:37.640239	2026-07-08 21:06:39.55	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
771ad7cc-cd6d-4e2b-b114-aa1138a30346	enc:v2:zO9AAkupWAWYhMF1zx2ng3YKun/Y4Bz9nc2pYDaV0ow=:eJWMWF/JDOStzg0a:Pe16eg60PVVrtqFaa1U2Ig==:Mg==	advisor	enc:v2:MlvkgafFvlgsHRf/OCdnDV18vQ0WmPcejaLyRkut+eA=:WvfcvbTacW1qDLko:AksurRh6/l+B7Hr2d86QCQ==:dN1Bh+A/lpJ9aSKT	2026-07-08 21:06:37.810433	2026-07-08 21:06:39.55	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
98898c94-562c-43eb-aa84-888a2aaf1985	enc:v2:h/2EdReVoIHIqxKAcNi4T0ih5IYH9GU74WtnmLBudTs=:vgpCbFdLTergHYbO:68/Kfhcj8AtAwjLaWQNFlg==:6q8=	advisor	enc:v2:eCpImJ9QxLvY45tJfGGGnGq/kkS7CPEnvDz7Iz6R8Mw=:i5FtPBMCcdKFYMGj:iaPu4zjttbj21yaxdPtq4g==:Q4avLr7pTHHa8m9N	2026-07-08 21:06:42.167942	2026-07-08 21:06:42.171	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
fde15567-3ce9-44d3-9c9b-272998f6f8ae	enc:v2:umcGSD1fMWt3fHNg2W0WkCHFLW8OwxUPiypwHYgdMII=:jHQaag8RNXqT1vK/:1/jn0HW850TFQDhqAIEOmA==:Jg==	advisor	enc:v2:kpWuoAYaLEwpWZshtyypmRLueSDTA1ipw44JtYT8VFA=:zWenwEQ5DdDt+mRq:wmB6mHE9xCVmK9cK7x996Q==:40a6H+FuHhn+8mWd	2026-07-08 21:06:42.566461	2026-07-08 21:06:43.181	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
5e257e11-cd63-45fb-a635-06d7dfb77c6a	enc:v2:r6Iqz1ovBAoV7qqMDsbIugOZvcUjwSb0AXnlamCJ9BA=:ykSnsrS8PjcBrtN4:FVho12fzoIH2VD+h6pmRpA==:vzyCGshyURZWSX8srsC7wHMVXOJY0NvWoLxnB1xNza0eVDT9zWzE	advisor	enc:v2:c10L9Lf05vy0zskbI0N0OgMjc7xh0S+HGVRGsc+oOo8=:X0WmhuvJy+mNv9Co:iVBJqMwKFj58DSmTYno87A==:BETGHNWXvYCdz6g=	2026-07-09 13:52:08.516696	2026-07-09 13:52:09.044	941e9d22-30bd-4ce4-b843-a55370287419
7247352e-d548-48c3-a6cc-74cb5c16ff32	enc:v2:Nzszj2C86GtF63dGE2H+FAt76Ni7cS+ce1CnS5CLZEk=:oOgTzMl1zTKHOzDl:65HEBwJZoN9/6O02rupNbQ==:IXQZ0WKt1beri4uGX7oFRobDAX7O//wdzpK+k1qwsSlsFZT8Og6ORFSxtw==	advisor	enc:v2:ev26EQ0OSbEYPayyJWK5oTnPDW5tze20vw/RNjIbD3A=:iDB0U93blpshlahV:/SyVOTFEHOA4Bbg9FhyfJA==:1rDHG5XgIA==	2026-07-09 16:19:32.703522	2026-07-09 16:19:33.138	977e23f4-d1e2-4b77-94ce-e3b081c3578f
a3e21262-a41f-4bba-8ff4-dd7d748cdbff	enc:v2:RxiAnQ8ImQpL01pDFSbZzHqYCoFhXOzs/t+fXCoJmG4=:lXNuHW2jxjDgCZBK:wpsMRCEnxZeUBVjksN6+BA==:zP9inw==	client	enc:v2:oWvh8r8rPREY4PnUkbeNoi1LOVGvhRRsDEg4IwHcc2U=:ET0TuVpmDfeLAIxB:RRW5ovocFL4ZfVPXPHQo5g==:VDWcvLe0	2026-07-09 16:20:36.020589	2026-07-09 16:20:36.468	977e23f4-d1e2-4b77-94ce-e3b081c3578f
dad26e83-4fe6-409a-9a42-33bd056b926a	enc:v2:IiZKT7+fzwu3BRJXNosJT/k2wCbXW2qlUbSs6i33V1A=:GQFkRCP93mReS1Tn:P0QQSK34DMDMabwpXq1j8A==:v+vx07ljBtdi3NRq96FnxvbN3TWQzx3MRhwS4VivTjdjW+ngWhFPIgDpZniPUJkDnCRM9tf7QCMC	advisor	enc:v2:J/DGS9+EvvS2NtlVCZSFLOGmwSTywWuyGvE/8Crhe0g=:XBOp5N/fQUOK3wjL:Uex2O4j2ZwsNUYsrDXUGAA==:Marko2LOVg==	2026-07-09 16:22:49.657958	2026-07-09 16:22:50.085	977e23f4-d1e2-4b77-94ce-e3b081c3578f
b70d8bed-2cce-4834-9888-4e1f25abc967	enc:v2:rLs2dd7SRPdzAxcsnd+tHAm6aIJKdhJK6Gd4j+++vMQ=:Vc3WghVrEMMkoP+u:OzY/IYmLFRiiJpbCrF/SHw==:0UGYfNU7WwQa5qC3XNFuB2Iv0roWMH1+NGDEGeVqST+3pm6aKgc/NreNGQ==	advisor	enc:v2:gLGyOi6d6j7pXYCY13y4EeH3JgOvIQcvYkEZpJQbt8o=:T/49Z6cVVGjfrFn8:AKN1ZfFYLKKNsT+O47mnsg==:ykYenZ2+sA==	2026-07-09 16:23:49.798167	2026-07-09 16:23:50.226	977e23f4-d1e2-4b77-94ce-e3b081c3578f
a50c4893-85a4-4a32-ac78-9792c1140f97	enc:v2:i2X8RBgW+Tt6Of09HB1Ov9Tm8Uqjzt41ETJklcJ6A0U=:GTaRmiXq+kwXT+4T:TARK+XJJpUCDO3lYdi3sXw==:4BX8MqBON+0ldbtyI8cmTKKuMFsAmIPoFw==	client	enc:v2:CMbIF5LdMwoEYlW+GX3GgJHaDi2+RpOMBQSPzQEyl5Y=:pY+/dyN8Cxysn50h:1qGKfNF2Qo/VX8B/PdEytw==:0S2xWHCR	2026-07-09 16:20:45.005471	2026-07-09 16:24:34.192	977e23f4-d1e2-4b77-94ce-e3b081c3578f
ac166716-dee0-4d28-a1be-3a6169bb8c3e	enc:v2:+3Zvvj98Aaoo4c7iNqIPRmQZVmChZrQ3knOrQScuK64=:VZys8riu5wSCdGcT:04ZMPisq5E6hRILohsCXAw==:ZLtq	advisor	enc:v2:wowl5K0KKI1MUodqnL0KwLguSoQo0nVXH/7ujSZ1Qy4=:P+/IFph1Udprzy/s:XCWwy67a0q2ff/f3st1bCQ==:Z9zpSQlBOObzzMM=	2026-07-09 19:01:31.64301	2026-07-09 19:01:32.093	1447f726-fd24-46a9-8cac-8ea09446603c
46530eac-b596-42b4-b97a-544edd5013a8	enc:v2:KM9AE31Kzl/+PGe8Tfpa6g/A7HdrJdAvOHhRf7XvroQ=:Z9KuQ4WdzKIRv5Fh:y1taur7n6rkbxIMjfsFDtA==:PnRK	advisor	enc:v2:Gyds5sueBcbIaZBMk4Y8sn03M2X0TaQc6YLbMO+98IY=:3XUlo6zrsig2HvSv:4SMt5GMN9ClB29cTXCYDbg==:msD3ECZONz+77kE=	2026-07-09 19:01:32.036673	2026-07-09 19:01:32.488	1447f726-fd24-46a9-8cac-8ea09446603c
175a219d-a557-4344-8054-9f7a3ebb56b4	enc:v2:h73ZvbA0UZWybH9XP39Q6asX5ERb35OTt/pu3aVZRAg=:yXC40VVQ7zLHP5TY:nB6Hmk71iUPhMQlq4EMl+w==:5Q==	advisor	enc:v2:Bbsbmi3U0oJphia7v5fXDXuoA3/NPUL9pQOVXpaE7fo=:dGFVF4G74wX2Zgd2:1DiNRa9Mpua5QlQ+eAuUgQ==:OYLb55VA5HW+icM=	2026-07-09 19:01:32.316578	2026-07-09 19:01:32.488	1447f726-fd24-46a9-8cac-8ea09446603c
9d6bea12-1316-40a4-9cad-63bf12111571	enc:v2:GSTqXXgOs/9+q2/Bj2ezN5yZHcOD5bh8taky3tRhfeQ=:N6ZvR0mSqLflPcWF:e0ks6ZNrJR56bd7VzWhXjQ==:wQ==	advisor	enc:v2:Ox4yCKRargcIsdEkOUDkKTjYVkRJlldo6SPTTnXe2yg=:NGXbnoM5BnGBWa1q:J4EQTz2r4k1unEVNObYmow==:LpQdEk1GCTNyAaE=	2026-07-09 19:01:32.516417	2026-07-09 19:01:32.748	1447f726-fd24-46a9-8cac-8ea09446603c
262d8a99-d3df-4fbc-ab80-ac2f5c34aefc	enc:v2:aCMgUFn038setb1XiVJCai3N+jGcYIC8cAH7vUNUYzI=:+wzZKUox/eGUozR0:M6hqRbZP7ncEm6XQTh5K/Q==:+w==	advisor	enc:v2:YkWUO5bCICvha8LqJ5Ciaja7o77i7j5+oJjB3OhGEcc=:CTxXex99HQzSjQ2n:IDMNoBxa3FCWItj2PH4DPA==:f06excUi8JQqg+Y=	2026-07-09 19:01:32.821117	2026-07-09 19:01:32.971	1447f726-fd24-46a9-8cac-8ea09446603c
532ffb55-9ffa-450a-9e50-bcbf2b937922	enc:v2:iDNB+3M75joNTNzYCtE5v9bE9U6SIbsxvKWuL2Gobw0=:XMvH6dfReAg0F2lW:IT/XCxlro1dTPuftWeu6vw==:jUll	advisor	enc:v2:UofW3bXauTATql3xSsYnb82qC+ibVkgEc1W2S0WSQuk=:8LaR916SEtycfDjh:s3+1oYtnG5wXELVhxzgiHg==:Dr8v77OH7Y9iKtQ=	2026-07-09 19:01:33.113396	2026-07-09 19:01:33.259	1447f726-fd24-46a9-8cac-8ea09446603c
70bd5dd4-3174-44ba-b1f4-ccb7f8613200	enc:v2:puEt/zWV1LJNkTSTM5fZ/JPC9cTG74kSkvlVWAna2Rw=:QJ0jHaTrJ4NaKERr:CkmJOGlzvGQcCdkn2dQQfQ==:avBb	advisor	enc:v2:4WDqLi4irvp6Fn4jKiFByz1DNqHTgCd13XxDB3GTQZM=:ce26CJBXzemOVKeq:ZU1C7VgeKGymvETZaUlvOA==:VNxpKnDjsGmC9d4=	2026-07-09 19:01:33.364805	2026-07-09 19:01:33.596	1447f726-fd24-46a9-8cac-8ea09446603c
82038149-3718-4e83-bdbc-79ca81db80bd	enc:v2:CVUMotKDEaJF0sCX6Fz4X6UhhifWkc6Sewga8IX/qHI=:OwcW9vrcM1AfD0Yk:TRkCwOFnDABHWr6s2/lZ0Q==:jnIP	client	enc:v2:FIoTWXRFISzVwDKtIT1vLK0fsqV7jvPg5PWu6Vz7idM=:EYAmk7x/U2MGuOPW:Ef2WfjS44UGUgkwra7JICw==:LVu/	2026-07-09 19:01:36.164728	2026-07-09 19:01:36.696	1447f726-fd24-46a9-8cac-8ea09446603c
2ca77d93-d678-445f-9fb1-b7d59baf7be6	enc:v2:LC86IJx1nSnNa9z6xKGnF9IVXlzo/Zt8709eQ7Mam8g=:u0XCd1hOZteeErBb:4XVZTWlKBJOrM3tlOpRMJg==:E6Q=	client	enc:v2:HnWOH2FydjfwNK8VWfBk+oe1jJd7oiSgszYO+puxlS0=:wh3f/jnA1LtaqKx8:MuB8MLBR9jOz3GJRwGrWXw==:L+aJ	2026-07-09 19:01:36.360801	2026-07-09 19:01:36.696	1447f726-fd24-46a9-8cac-8ea09446603c
19e3bda9-23ce-45a4-8765-bb00a3fc49af	enc:v2:s5vfwlWCVXCbELxr5eEAf7C8oLkFXF01lAddSJgnHyU=:Qmhs2XKzGyWkD0ch:vT+nkzsqJRLZu3kk1Serdg==:gQ==	client	enc:v2:WmYPQdqUv1zL4jcV/zgJrgR6Y81FWM+InjHRdVUDnJo=:9EsVEwi0zxdjcNfo:oqU/3ONpWsS1INFbdBv3fQ==:vNKI	2026-07-09 19:01:36.54018	2026-07-09 19:01:36.696	1447f726-fd24-46a9-8cac-8ea09446603c
2757b7bc-9060-4c74-87f2-aa6ec6dcf393	enc:v2:LVKapSIM8STHLB213aa/lUPEnfdMgELzxFBJfY+2kIA=:YvVhHUhOc4LhyX4p:Ek+vuX2d7Cj7TpaViW/xtA==:fffe+wZCjHGrgdhD8A3plFxcprrPZx4B9DTGmj7AvRk7p5dH2VETVGgPU73/JIe4tXXhzcGRI8+D	advisor	enc:v2:CZAZTe3dJL2UTmHlu32Yz3FyE7OwjQyn5NeFd27k0aE=:GT3zB+YazWhzsdKP:1v5sTpDziR2AQ0AorXCeMg==:p2j6aXgYEw==	2026-07-09 19:06:43.881522	2026-07-09 19:06:44.342	1447f726-fd24-46a9-8cac-8ea09446603c
5d4b6499-39e0-43a1-bde3-16a92f3c4b80	enc:v2:WOc3t9b+jGhAtMG93EIoxRgzq+I2fKBUDtGsHPI4EGc=:EEaSezNK6SbqYyJt:Rb9vhsHh6hQ3j2+t0PJysw==:aQOW	client	enc:v2:NPGRTvEFZJptU9z2yigGdTQ8xkxRBv73FqWV9b58xQE=:QfHhg7CQDCLv8yMb:UQRLkwz0N/Z/NzmPyJTJ8Q==:3O+wFFPX	2026-07-08 21:04:27.105312	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
58fd41c6-dc04-49a8-9c7e-ba4b0f384779	enc:v2:B1bf4jpsQL67+eDknopb/eZcq5ihv5l/ON+MOT91IJk=:5H9lyUUqfNUAgeFd:5Jb+0sX54s9rqTw7EkHU7g==:6gw=	client	enc:v2:I6/VP5U6/gm/DKW/M8iQDQhVBOXCI1fupOgvMpI7UIE=:tpYnieA9+ddlvwHI:7d22ZDKyuQRCCBgj4Qs4TA==:rwm8KEhR	2026-07-08 21:04:27.222064	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
aab26f4a-2b04-4abb-bfb9-905c601a60b3	enc:v2:nH3fZlKJpwfD4VtV8BARKOyBUXBbZc+9r12Ju/SVPvY=:a0jJEnFa8fNHGLOR:iYy1l95uCbmQYb27HWME4g==:yxRx	client	enc:v2:qj8t9qBhywpFPmGKfvACQ4IzfwYSMZsKu8yv4gTTsKI=:4k0NIVStscHT4iw1:ZtnL7gSI160lKJtaORcfDg==:zUcVwkrI	2026-07-08 21:04:27.328076	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
d64f9c82-1610-4d76-b62f-f1945cb6df62	enc:v2:1VtKO/1VqBF8TjPbpxZOJutvlaXHkn7K9XpL8YVnp+U=:Nx8jD0W1IHqwihVo:E4s8D5BqL3ZI1OGexWZwZw==:dA==	client	enc:v2:ZCf3XESo8PD/9+LlUCVMgLGXnjQPsXOTIUVmq5HSE5w=:zuoMKFFYqG/Mp+LD:J9r9EkNQsywvhKCsblAJzw==:O4lwyKGv	2026-07-08 21:04:27.446175	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
d8053d82-990a-4a69-b85f-5c8fd3539163	enc:v2:mMS/vzpc77nS5LQNSV4P64jYeoIuP6YACbyTSBETEP4=:FQ5Edpxw90YXNpQP:nUIGjuMNa5ibnwrV4D454A==:vA==	advisor	enc:v2:+nSC6Md9rUX4f+BfF4+kED+GEgsZXDf1x5dffZULrSU=:BOnc9D3tWeUBPubA:vlTHDMfC6hywxDa1S/s8vA==:WC7lSFyrmucAa7V6	2026-07-08 21:06:35.680415	2026-07-08 21:06:39.55	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
4e8eba47-0ef0-4e00-8750-f299e0e296f8	enc:v2:d5m18TbP2APAtNFAnb87bdJ7hnz96hZ/N10fdNkg3gY=:2xcPZQPsAghcgHaR:2eHnM4PkuYjp1h1iF9n/ow==:Gw==	advisor	enc:v2:GOuKg25d/rYNeb5pFJSeyFuDj4aUpn5Ivz5gcBtAO40=:UXqk9k69N7DGXvM7:LZus7vg0Sq7lskGYYjziXg==:tdzS/+JTU7ovRbsy	2026-07-08 21:06:35.884645	2026-07-08 21:06:39.55	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
55fdfb17-fd91-4992-badc-79c26d2e9707	enc:v2:lSFxt0GGoK8GVUGUkFZxTY3Cd/a4BZl90glPTHJ7Kcw=:397xLoydSwc0qQsz:5Hw4W4UFuYMbtIR92mLIcQ==:Kw==	advisor	enc:v2:yptNbOKfrLa5/G+kjgr3p5n4WW5JSG+DWbCyEwOEBt8=:Wwy7l8j8U7UzxGCh:i6WjljSQI4syVM85DN+DlQ==:HqIMZjnXaMoTtABP	2026-07-08 21:06:36.06082	2026-07-08 21:06:39.55	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
14b2ccbc-95ee-4ea1-bab8-fbf07d83eb51	enc:v2:FLLyYYm2YVpWOPRpKENFxuwxi4KwdYNTZLzIBVVNooI=:93kCTTiyKSa4gXuS:dBZdeaJYAtehGz33FENT/A==:sQ==	advisor	enc:v2:QD7Ug5Io4i+zOxb09n3wZnHJPt7z9aJL3HTdVexxphA=:owMkODCzQPpkwcm7:pj+T+L+kNhl2qEIuJqLehQ==:1UgGPuJ4C55rriqf	2026-07-08 21:06:36.237814	2026-07-08 21:06:39.55	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
d05c8653-d6ff-4b33-9712-cbe7d7d5049a	enc:v2:TDViy/Rp2q1R8TcTA4+UGyeDbzCAKNRhKcHuGJAKft4=:fxGql4YsJ/ANqQQl:APUxuyBjIQiw/mQb/agHpA==:8g==	advisor	enc:v2:c7rlen6LgADosNGr9u70n230lWCOKPFbIfSoR3bCdqw=:TSJ7uF50tzzVWgfz:DzzbS3Gx7CBueJ/0lQZyhg==:zqcSkb+p2e6nxNdP	2026-07-08 21:06:36.408733	2026-07-08 21:06:39.55	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
77e1a0e0-961f-4209-b3bd-93290d3f25d8	enc:v2:6YmSJzIdmbSDWAp6mdtC5ltWASdi4+cbndJ4bdAPglA=:4IuJZ11cxlNngOVH:PJgEN2LPJ5woKkXDgVC7LQ==:rg==	advisor	enc:v2:MYXaT9g3Zn/SzbMgUIb78bmAg5GMpYK1orPNazaw6y4=:XyZvYP6ZZKQKK4Nt:FWozTUMlCFwOGSfqnlIZfg==:6UtFmE99zt8nA735	2026-07-08 21:06:36.572267	2026-07-08 21:06:39.55	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
f7090611-3339-433b-8be9-62281c5b4ea2	enc:v2:fCezysOWj/uEcxjVkV/k0gEg/S8lkEkYxLO0nYzvPjQ=:oWxyMulywbnlaRyW:VqW99j5o68So//c0DK6Nsw==:kA==	advisor	enc:v2:YqbBnCC/qNtQkuptgjZiGOYYaVdln+RhVsUumdU1GyI=:50JRZ0mGHp9zQZQG:rdHnEILWevIIfTa+CmYYcw==:1t37ZrlgfPT54ruB	2026-07-08 21:06:36.819741	2026-07-08 21:06:39.55	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
bdbc830c-9bc8-4ae8-b069-7cac37bf0bd7	enc:v2:N7RXfFAKSQWukZEoTOQLrW1rDdiyUw+R1KiGTGIwPYs=:fI+LYxi3rJtX5tqb:g6VrJfcnr8jMIb9QMnjZSQ==:LA==	advisor	enc:v2:VzgHSMK5fF66hWkO8B3JHE5DjaVhr/eLMWQTIR8fmvc=:yCP0Ha/y0V25zSil:s+uVoISMHgT7eBnPQFaNDQ==:roO/bD4HeelbVl6t	2026-07-08 21:06:36.928855	2026-07-08 21:06:39.55	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
6e20f45e-4212-4e30-90d0-5e4a669fddb8	enc:v2:y+oIkInZLaINMtiRfWoiJictx8yxh5c4StccsR4gAr4=:+u5g0xGgfPgvRBax:+Skx8anmQDY2AVtBc5x7TQ==:WQ==	advisor	enc:v2:zEWe2XPLqP+NSAk+slP1ji7BQvXzdI8rULgvVPsl6xg=:RaFPd1OE+EEi+sA6:OfXmM2pcfrF2jXqgRGi6fw==:pHX33FHF4AifzMXT	2026-07-08 21:06:42.566605	2026-07-08 21:06:43.181	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
db14ea9d-b17e-4d00-a059-e10cf1e4f524	enc:v2:+GYW+iP3a/mWyyidllQo2G33wO1ybPFgMwC3OWCL9vo=:NTLbuB3Ofhkt0FCM:GDtNyhpPOJtZXGpZH0059Q==:iRgot2nXgjp5OXm/Co1Gu9Hjrr9x7r51pFw0ePPGnZhd9mN9FMBd	advisor	enc:v2:QR/DntjBwV0daDf2oz+3GX4z4h9P26tkNPi14ykuI20=:fjIzaFmbiWOmLSuZ:pdybtgrVZVAWHpTtIWSsWQ==:zatZw3odtnnShHO+	2026-07-09 13:57:55.636342	2026-07-09 13:57:56.193	16008d38-1279-4b97-bca7-410382daad58
a81d7ece-db17-405c-b2d2-db32c14e773e	enc:v2:14lO9t3fWB1Blp/KWhUbukL0qPKxOXKIluH6821lbR4=:pZGSzj7a0zw5agVo:5XntAoyJJkdivkMhnlqm6Q==:rX0=	advisor	enc:v2:d+ssdQpQNjQ0MZymOTImXlJrGeBvewoCtEzyJezc49c=:SQufzuOQNkrvdFyw:DJBwm75WoNue5Yr/L4m4zA==:S8SD2YzJEJmoRMhC	2026-07-09 16:20:28.949227	2026-07-09 16:20:29.381	977e23f4-d1e2-4b77-94ce-e3b081c3578f
cbfe5836-3c06-4d0f-8fc7-b67c059e771d	enc:v2:RTNjQHB2kt2ZHWvISWPJs8Tam39ui0KsN1Vu79ifJIY=:qV8TBdRuBqc9xlFS:joa4eJqzC2Q8f6aEji9S+g==:szj1p/S6Qbqh5A==	client	enc:v2:98PjSpQXS8J/v7awAr6O6qyP/rubs8tzOZoIN4x7L0Y=:++XNLx8KaBvQ96E/:fbQjt4f/PVEPs7OparhTTg==:I0pPVG2o	2026-07-09 16:20:49.517405	2026-07-09 16:24:34.192	977e23f4-d1e2-4b77-94ce-e3b081c3578f
ec80d257-c0af-4ae3-b79b-5dfc73bf2e89	enc:v2:RrqdfPLKHOZkaCigxxQMmbqa9lX4dsY1NW+mdowsWVw=:qReL8Ew+xo+qju8m:bAZHmBU1Z05zyYozuNfIkA==:GJcf3O/UxGM09+oVoJZtzLQeS0spFnjB6zutL3fkZcPAV5tLb2TzmPe8EQ==	advisor	enc:v2:1ercW1pjxv9BYe4uoJ+HEwmvE5uHfsIZWRwX0f4apzM=:JsNE1k4SMVlHcsbn:sQU/g5OZtvCtF+NkWuMmUg==:WJczwNGLiw==	2026-07-09 19:07:44.026512	2026-07-09 19:07:44.494	1447f726-fd24-46a9-8cac-8ea09446603c
c568b00d-54ec-42d8-bda6-9f462ecb3669	enc:v2:KtwX4htgCQu51W4k2ZMOLzVBxaxi5yfVqaY71xESuMc=:VX2V+xCXUU5Nx+Ob:hXagTn4nws2qwCegZljTOQ==:VA==	advisor	enc:v2:Q4sWPJkkTbr1gS8+jZoCDRLbQP31Ve/RkicYdn1S0zc=:o5jfLpvpsCEwFuqK:BYXOd5DmxCnfoRSDEsOG1g==:VGGHsgAgWabU3j7r	2026-07-08 21:06:42.16801	2026-07-08 21:06:42.171	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
bd82d52d-3fe4-4408-83ca-015d80f91283	enc:v2:nur0VQ1NyHykNyUGnCLtnge4t/JvpCeSJsADQHcMY8o=:NESleWmCs4388IIW:ssjLgl+exSn7Ij1CvPzPzw==:wg==	advisor	enc:v2:5KLIO0723L/cUXLd4nyFXodWa1UaXjqAWa4jUMa9K/I=:wZXhAN5rXzzBvXn5:ZehAT9XjW1QtaQvamyciOw==:gil/+F7wm+14BIVn	2026-07-08 21:06:42.728105	2026-07-08 21:06:43.181	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
ef3000ec-1934-48fe-a23c-7aa0102d279d	enc:v2:LqOn5xyGayZW3KUh9ARZh9het1NckJ1I+JEbkveGGI4=:nAwqSoF7yPEvGq8f:CMK/9nF9ky8nFGA1HxJyjQ==:b9B7sZo1oVyZjLIm9UHvWVecrQqRDpuKWNeuIEqUrAUTmhkXn1AIqBgbUA==	advisor	enc:v2:geEC26/9GC3xCq+LPutKlpPu+O4qGTt6CQdQbvVlS+0=:6E7HAypD/bQdeMm+:0ZqxPJE7gEHBDKxkDNXsZA==:rk2HYIggwA==	2026-07-09 13:58:55.838618	2026-07-09 13:58:56.27	16008d38-1279-4b97-bca7-410382daad58
6b806fdb-1662-4bd2-a080-8da397cbb18a	enc:v2:9GfMh1LPCJS23blsdUBVIW0oP9kpE24hH+fRq0eMBAo=:gpLxDM6Rry0BJNXC:q4FNW2V6MdZEuDMa7mi7dA==:ZbEdsQ==	advisor	enc:v2:DoR7hbyOGjY0gpdTgS0xLlQyg9EEh4LzcephITd5Ayo=:UPTVG6GoBrI99SSi:steGHPCmTZN9BLtA3q3w4Q==:nXeLzMtc34PFpLtJ	2026-07-09 13:58:57.12916	2026-07-09 13:58:57.56	16008d38-1279-4b97-bca7-410382daad58
e654ac6a-c499-406d-bf43-1849be7f66e3	enc:v2:D6mMudFaiDkoCnJs5nDsjYoRbWTXzvf2WT5XTtb+UTw=:KNuZUHhmBVHv1kVu:p+L+bBVeFS7sOGpjktrFnQ==:z5c=	client	enc:v2:Rh1DAAmmTFSzHdg2G5szZE5TbhdJDSjcBz9vhkS4BqA=:5NuIMAHQ3lhViSpE:P5NqfnVCBHteAjhuUBrYYA==:5duTOAqQ	2026-07-09 16:24:27.724368	2026-07-09 16:24:34.192	977e23f4-d1e2-4b77-94ce-e3b081c3578f
ef2354a3-d714-4155-9e98-49710255fe95	enc:v2:kSW0701MAupNY8c6FV1+Bdzqq5c6pDjW6189xLr+55c=:M28da4AA6a0I0eso:7ZH46Hy9sc4iGEVWeS+rtg==:+8el	client	enc:v2:1YenZZVYVrihGhhySTlssC6jeNfUqqzMxs0alOe+eL0=:JsmfCSqCxU6aNA9y:Bi6ItX1zyR4O/1/c9Pfv+w==:WtGdw55C	2026-07-08 21:04:35.588037	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
b443e42b-3029-474d-b3d9-a51cb904135a	enc:v2:t6Z5R99nqycq5SHZUyEq34mYP4fZfbN4P4QOn2Dtg54=:kKLtBBMAPp0xeBtn:GZ/3D+Q3uEddQT2h19M9KA==:5SVKcJo=	client	enc:v2:lQlN5A/HmRHbCKCVb5HRBzc8vIx6uSrwFwSRwVqfwFk=:VIzkXBbeXpTyYpvt:2edQFmJ4KjYJ1xVo/3zX6A==:fNSP6msV	2026-07-08 21:04:36.199487	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
8a9def68-0956-49bf-b8e4-b23c7dd4905c	enc:v2:c6ySsoa9ia1J759IALoS6VhkM1S+NYCGEGD27mquE3I=:M1Bl0va6W/wGf8Dk:MGQuU2mWmECBUWfTS5kZ1A==:fg==	advisor	enc:v2:A1dUvR//sApeJbTNqQmARVJTdDrqbzD9/g4WYbfC1CI=:M15H+5xkFRecKiTa:AxLu7i3lhoNJLFGe8GboIQ==:a5nuSrG1WszkO6qV	2026-07-08 21:06:42.460048	2026-07-08 21:06:42.618	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
7c106e7d-458b-4ce1-8e85-55d1a33d5693	enc:v2:tGBeqQONTQFCRnf3KdlfbmnQttZOEaW04dSvc+oowW8=:5cG5l7E6y7FOiN+l:NKrVfxK3MrjdsWCtwk8snw==:1A==	advisor	enc:v2:Xlnj0BNj+aut/a3AD8S0tXyAsV7uvYS3aheGs527g4E=:O8JqGQsmNhJTy09x:g6JsVqRJNBPD0+qtWVbpGQ==:EkEOoawtq0vI2icF	2026-07-08 21:06:42.783872	2026-07-08 21:06:43.181	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
d722485a-ec27-4b0c-82b4-46ac76fc9ff2	enc:v2:x29m0d2SHJEjaShPYS1nIzv7JDheU9STdJrfuor8t24=:+5hCa19nuTsWAOyC:apLv2cDsfhpcmqS9G6YZFw==:yFkC+h1kWAGMBedVvIz4HrTGcfckEjUcIm2Ol240jH1FxY2e6sJlBtKwTiSeV4kJnJQ=	advisor	enc:v2:iIp76FdarND5qYTucce0lXNCh5YGemjIIuwRk8a4tBU=:c4RhvwDeBdbXB/HO:DkDx6JdYS8r6JtLvtAoVGg==:BHjCmY3g+g==	2026-07-09 13:59:57.278471	2026-07-09 13:59:57.712	16008d38-1279-4b97-bca7-410382daad58
2b607c54-0a4c-41fd-8cbe-b4134045d8c2	enc:v2:2UR3hvg1Vro+G0gRK9Ta18pO1yUOCujHSr5BaHldpwI=:vqWHcpL5hi3TH/6A:60HhYbD2GJUv3BfMkZACfQ==:twydnBJNImb3avMHXCP37Mve4x3GDXBzN5sgjCDWHHhSh0vmSuGN3ArtGmxTuRKTtYzC9z/qujKu	advisor	enc:v2:h+vEnepyfXiFL8VbMy3KMbE9YiYh1eUfWaeReiy5nwY=:ssFa/GvOW+wVUYZL:lKzLd6gEgMyxgXbWs/Y6/g==:sLO3UH+SZw==	2026-07-09 16:26:27.863893	2026-07-09 16:26:28.291	977e23f4-d1e2-4b77-94ce-e3b081c3578f
2bda1323-c174-448c-9ebf-110adb46bc04	enc:v2:Xd1lq7J5drIXvbv5YAc1rA4jcApE8wiF++f4vbb/w54=:BM4Pdjg13cs6vpp5:8ogmuAtON71m+zKD4d7ASQ==:lw==	client	enc:v2:+BAcBfmbkyGgp0OBpT0tOc3sVKGEKHmiIziNFvbPGWk=:b1iY/+GC/0P9DOKI:Es3GISQRxWk5V8lJ68A5PQ==:aEK6jTP+	2026-07-08 21:04:40.173281	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
9df7f56a-7ca6-42f3-bfe7-4752c387d565	enc:v2:eOs9bFBqHBTDFyEa3+Sss7DOvehp75o4dsBxWOhYtnU=:n0QblTy/LpifkAer:vEpptQSYtbrmosuJhLjcMw==:9w==	client	enc:v2:/vYp67wP7MOr//Z2RPV2YsUSKLaO9LbfdGmtIdoqY5U=:qzZ4uL68dVwd6KjG:2KMeWB4rFd3RdXEaunRFyw==:YpYRztBn	2026-07-08 21:04:40.381492	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
9f0205a3-0986-40a4-9161-d30c6e087e6f	enc:v2:hLQUouBgoRXZ03XiaKLDg3mkmOmXBs1JCU5aDJbWHek=:M7ZhDTw/QdFF/TNG:16NCuFTdCf5NKkPdEEMR8g==:lg==	client	enc:v2:azHvEgPYq97U4Uk+wuZ+PK2PYzWbFshuvcPB7Z7ieYo=:3YyOHC25WENT71ZO:WrqUvcd/g31Igd0UxQwTvA==:8Tgh5vB8	2026-07-08 21:04:42.126153	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
a149567f-9d5f-44ed-812f-f17bcd8c9ba6	enc:v2:oFh0ouQwx32i7X7k4rv5qQ+Mj7ooHPcaMyqzenhKt0s=:0DU5kRq0jgdfKzpG:Lr66Aw7X7qAx2RmwLv/L4Q==:eQ==	client	enc:v2:gGkGuNZGt+1D+4ReixSwaVzBZg4JE6vbRBGsopCOmPk=:Oni8MqJ+A7Ce9R9B:GJiWRCPbgjinLWSiSAX4pA==:juzr/xIt	2026-07-08 21:04:52.811894	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
4f405665-3ace-457c-a9a3-b31588429dc5	enc:v2:Mi49WWPeaS237JqLpAzHV9yuXH2yYVlbaBDBczfzhXA=:/idOkC1U3CI4RqTX:wrK0PLbEgEtKpD6K0GH20w==:mw==	client	enc:v2:k+X0vqij/iYKyBV2SgxhiRs+qlrRpkzkMkm5R2XLbNc=:TGDdN2YvQci48447:o0aEUHk/5TnS3uHegvWE4Q==:bqsIKddg	2026-07-08 21:04:56.234078	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
d6a67111-6fdc-4a04-90d8-031e2a54005c	enc:v2:rjitxGNl7kEQ2g3glbgBS+Ksl9LKfW46+ut6A+wBEUI=:hwlUpxbsmn94aBBj:PG6+QkWboRGbRTdwnuixBQ==:yg==	client	enc:v2:cvRudLuPeSyGGl6GUjakyZT8HoRt5gE0M32XJ2d3364=:zM3skceKtst/u5Mx:6Xm1Io9Z96wkbeg15X1+0w==:lmfIbqk5	2026-07-08 21:04:56.406768	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
5ae08eca-a2cf-444f-8260-0af2b7681715	enc:v2:/fykOwyRysHYPKYTgQZVpGmx3fsSHxo+okDs/CueopM=:cc4fjfrsJsiRuwoJ:MoDlzavngLwnCCNjkWjqvQ==:Bg==	client	enc:v2:SGN6lL8I/8/vQtyUVvcBJOE5EIgvgNHm4HhZL7s9LyQ=:RIyv0vxZOTBULZIF:aIHbJ5u/TiASuNGcNNZldg==:zAzIjtXx	2026-07-08 21:04:56.532817	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
71eac102-836f-438e-9ab8-0be1a8656919	enc:v2:8uTKi4i6zKoFlGag0rL5gjyhvl1YK+FV8Mq4gYOnFqU=:MFmUUznVPr2mgtYB:TnPqz4Sit801zfydYJ1m9w==:YA==	client	enc:v2:8VRKYWcKFt9fWa/URJvzsB0Fq1uRQ16t6NDFEg5oeuA=:Ere3Q7UFB3HhX7eJ:cKV2EOLnMKE3ipJ3U6BesA==:tGsv8V3k	2026-07-08 21:04:56.63797	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
740ad97c-8416-4774-8e42-95661600f02b	enc:v2:e/SRei2JUGLHGgxwFUY7u9CeeoZyaDo4hfB/Dpw22cs=:hTNG5adXzsq/0iIx:dfIsnoicEgodPfnDocQNqg==:Iw==	client	enc:v2:iBHfs36h6kA9L1V0JYIzsqN/Cvqh4F5mZ2jaGlk7haE=:ZPnu+/WKgFXPHM7e:FioHvxOKBBphJBBKHzO9Dw==:MybCJXhx	2026-07-08 21:04:56.895526	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
f0a49373-0299-4c2c-bf8f-29c4f49f8f91	enc:v2:zahlwpgQ9bYUAj0ThFNIAOdQ6AlclawkboZnijR75t0=:YD/HMT15qQeZCr0s:3SEGvxU/YRLthjcIxDczKg==:CA==	client	enc:v2:/htcp2SadyFAA11+ZXyTGTeedpI1lPnIxgQOXflAaBs=:4d9sdBTaHq/DFheG:UvVP7Qgq48D+ZRJtETLk/g==:nHPTEZ8u	2026-07-08 21:04:57.118474	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
0b78b6a7-a1a4-4a6a-adce-9566b3d70739	enc:v2:Sks/KlgvgTr+dOfvSqDbQhNmG5mXb86e5BE51/TMPSo=:FCVm2Akse6JviiMs:BN/2Oq/1q1kgW6K07Tym7A==:FZqYAy+yrSxQrjTQnFRE40eRC+nZ4JNOm9hPEKQe+WiU61SvLuUXGRRaDw==	advisor	enc:v2:ZNXYyR9OnfypsT4v/moY6GrP1PiDFJOwaq4620jjNTw=:ie3eozqx7Ka/o5a8:ryfTJ7QMUxtzsITQmB3SGg==:44My+6pcZA==	2026-07-09 16:27:28.003999	2026-07-09 16:27:28.434	977e23f4-d1e2-4b77-94ce-e3b081c3578f
99e0d24c-574f-4e7a-9a3e-56dac70207b9	enc:v2:degVylv5IG4wDy8plydQ1uQt28lfMOd9fW2tRRB3yFo=:tEiS78gIw5Gp8RCi:3c5brGvSdcau2+NCUpgQqg==:/w==	advisor	enc:v2:01ev0KFJNXXtGJPoD4ZrmJ/DUtV+e9AsH8PhZ9i3BV4=:qcHjbIocBOfENMob:P2hChv82sYnkguQdA0OQkw==:OxFX3lnkPjOCSIbo	2026-07-08 21:06:42.459106	2026-07-08 21:06:43.181	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
42336ee4-6e5a-44b6-b3aa-1ddb34038000	enc:v2:0J46sowju4Y2UWpTrBKu0pqstbgCGzNb942ZJM9LwIY=:CHqu50qONdMTku80:1F1v0JSfYiy+BIu3QzMBkQ==:cw==	advisor	enc:v2:HveFs1Zabpn+OGRyvFPRbcugh3AbQsU4NcHA/Z7tK2w=:S/GweHQ224DeS2U6:HAU0b+ZpeBIpT7cJn1sE3g==:muIq4uFq7fiJH/Ru	2026-07-08 21:06:42.784821	2026-07-08 21:06:43.181	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
e8daac8e-b030-4a7e-ab95-cb150289407b	enc:v2:vrqDksBc62RlaBXhZlXc87D72tFmv670sXFH2Cokf6Q=:xgaXLCtGwirXPNHt:SKrzZ+7SLA1UTAauqW3KVw==:lcMspskLi6PoHilnT8N+mrN9xQDvyolCGze7WZZw8aWmlOsJiWuU	advisor	enc:v2:cCzXezc3H5PKppLW0jTaBNWzu4XLNT2/b8P5AAnHQ3A=:k5vyt1EqjMmpGSU+:Y7skVUbj0+3GuYq2kCz6MQ==:pQbpADeobiUe7pSJ	2026-07-09 16:18:19.789083	2026-07-09 16:18:20.405	977e23f4-d1e2-4b77-94ce-e3b081c3578f
fc111e74-0644-4b15-868b-ae6d0a677b60	enc:v2:fxIdFMg3mozoDjRZAhVLkA+oJUHxpuqS2YqyOCQcZcI=:JjDHZ3wicVj58rM+:+BduoxW69bEbkcAMQAhmTA==:B69x8WRxRqkLTcKS4pMOf91l3x3+hLoW43r7TzFDFlMEB1X05nb8iJdsN4Vf9Q5HdrI=	advisor	enc:v2:1Pc1KACR7qLFQhM/F6RAAckiD7ARTD5J6gAkztY/17Y=:F1lUe8Tw3iNNrBVJ:UuefxDR3FSxihF7fBJ+DbQ==:a4M8wYY0EQ==	2026-07-09 16:28:28.164734	2026-07-09 16:28:28.592	977e23f4-d1e2-4b77-94ce-e3b081c3578f
514d4d00-3d6a-4336-8193-73fd3ab06a79	enc:v2:C5+ge353sSVqifIDT6Hp5vpA5TsOkI67f8/bNVDQhfc=:OdEYd7MVOus7fdhi:3BQYk0Ozrw2BZvswJ1A5KA==:XTQvcg==	client	enc:v2:wE8z91N1xth5mUbgAB92vhDmYNZhFf8Ma5LYplL0gTg=:SPEWEkwv3ND+pyV+:cnNWVHV40lRZJ6W2VHZHQA==:EYU4zcjN	2026-07-08 21:04:15.086439	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
2eb1889e-df8a-4114-857e-8069e76344c0	enc:v2:LtAfUMvpc5q0w0hLBxbdhMtahUmBgkcG3DliXcJr6ko=:ixPwwBrIlt8M5GOf:d4WvY8o9pmHItZuf+0ypfw==:e6eC	client	enc:v2:OuqO5hBgQQq+8XxOb4PLNeMl9N+LGsuU3UAWc2KAv/s=:BVVWF7lmvoQ0j2MB:+CbyLIAqcQguXEx8t59SVA==:4tGc9xP+	2026-07-08 21:04:22.303812	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
4ce6ba7f-a3fc-418f-9135-b2647c96b22b	enc:v2:LnmD0eKVKKCg829lJRS/iHTDIlKRNv30LtgA9XE1FRg=:9ch6j9YbjE0OzbXE:nZDWZ3aONgbYa0iYP5LbdQ==:ykK9	client	enc:v2:bCxS55yNP8Irsg5TcgDz10ldcpWB2mpjx2tLiCQU4Sc=:3PjDclkQpov68jfF:TxXyh5Idu+p7pXdfG2/omw==:KAbsqJnj	2026-07-08 21:04:23.671645	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
ef066558-8d45-4659-9f17-d4a161fb02d1	enc:v2:kDdi3exSG0dR0IBnxFFE+/q3w83PVBN6GpeD1HmXY8s=:W98uMFVYwD1CxChb:K4KrbEBCnAqC1UfnWUsTxA==:wA==	client	enc:v2:FhgDsTBshICg1DQEQ0zKYpqWeq8bkOmG6ncX745yvT8=:5aV6rS40bXQyaWS9:P+Q5hN7gdzJ4hQAlRZZcDQ==:WQttl/k2	2026-07-08 21:04:24.054313	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
6594de7f-e7fc-45b4-a963-9e0fe205f3e3	enc:v2:I+lMh0HiLQchTGmio7ighgbNHqFn+t7TyJ/HqB+p15g=:tE7iwN/8jgEJArdu:owfz4Ec1qm/77unF+ec5VQ==:Cw==	client	enc:v2:GnThue9UiWofFwlduN5gwKXPsdNefnAXttbeMVOKMBU=:x7BbOAxLs9PsidiV:Nk7ZA/PF0sZ/o+kmQGFIEA==:+vrZGI4s	2026-07-08 21:04:24.254392	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
ec5b1ac7-ea7e-40a8-9e7b-d7d0ae926ec0	enc:v2:kYAfp85vA+2+BY0mBm+RNtsJaC9ybEKf/GSSg99+jIw=:b13mQ70byDAvX54L:8cwDL0QiqzOB3dCriOWUsg==:WQ==	client	enc:v2:n4oC9dHVY7VJUpKzQEzIuuFTKHc3H7iSDUmA4sOFnpo=:hmgWcUARSyHMAWBI:bdAY6Ldkio4hTK4W0TLxQg==:CwXH2/xU	2026-07-08 21:04:24.856005	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
9a27d4e6-9341-4689-89e9-958d2020c0e7	enc:v2:R2ycb77q1hY5kpvild5X5d0TUutXJuZ04SrwAQ1fuac=:8+VSopvkp2f8LZKM:DO1Olu+oiAu0nla0FGLf4Q==:7w==	client	enc:v2:j8TnQrc0mPIJ9KImo+AtgeTNT5TYECbswTkqPdSf/2s=:H8PcGS5MVsa4e/Vb:vhTHhoZ+aWiHxP4sC1b7CA==:wsoirlZf	2026-07-08 21:04:25.12662	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
c34af5e0-f11e-4a72-8eef-bb0818f68d48	enc:v2:4djkRYsOZYAtIKhqBKnjYQfc1AVvrIoW4LX/M0BS/h0=:iYvmmxOUMcklHT4c:YqNgtgxm8zfNKFw6t3rFvg==:dg==	client	enc:v2:FacNKShzd5rKd3Yw/W3yxzDoG9nT1hO5J678iyoKLnA=:h4YlTFkbRSWkBa7Z:CNLouAD8dbbDAHFyuSF+yA==:kksChd2a	2026-07-08 21:04:25.254051	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
fe13fb95-4050-4718-bdbc-9022d62f82ed	enc:v2:TEOrL9y6K7/tzdkputUzGp+P8xQTRp3e/9+EbiW0w9A=:Cls7WBDrhPUbA4rj:qG6aCqd+WL3ol8LHkbIG3w==:fg==	client	enc:v2:BTAbdhCU00KpL5KRzW16XBg1ZIj9emuoMCoj2UeP26E=:sXigJVjuX9U/neRq:QAHk0wb6kX3h2K7Cla3g2A==:LwlnYtGC	2026-07-08 21:04:25.401134	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
5817e609-4cd4-4060-82e3-fbc1a0a463da	enc:v2:8TsTlwLCe9yT9YalfWczJqAJHqMwC0wFI6AoNLZPkuA=:aZGclAO4gQvlbEDb:dCWvzIkmJgGq4gGhYsXuRg==:8mg=	client	enc:v2:offQ8tr+QMrq7pWF6PPHIv7bS9NxcCRBVNVV3b8NcFE=:PL8XxBSzxN2AN0V8:7TyfhQSchCybFCvysHoYlQ==:fSAyJ8YQ	2026-07-08 21:04:25.623968	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
12c25f4d-1f38-4171-988b-4dfab3ea5845	enc:v2:a+vLYuqH8i/ClMFgxQr2Lnp11sdlM1puIY8OBHTBZ/A=:yVHGvrMkjBaXA8ot:e4kfMO35vLJEAm72LtFJXQ==:v2Kq	client	enc:v2:FmuW8WF0oT9IY8ZiD4RVc0FrRrIDmKtQl3sPTyGMMf4=:pvyjgJlOMGkVNomR:d0QBOPli8uPIM2ltdN+CqQ==:7SDKrNF0	2026-07-08 21:04:25.712253	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
9a4a99af-e5a6-435b-8371-b4cf51ec1ba8	enc:v2:hgCZCSaKSyW1qM4B0NeJuOil6Inl0JdBvdSy/4L/tas=:dVz3OCwldRoFA7GF:UJMpbVC3S9uw+/KO3qRVUg==:Pj8=	client	enc:v2:yIcSWvbdSOFn3X3+WMmVK4COSkNvQAGImgJ82EJ8nwQ=:uLk8pNgcw4L8BKJn:mi/7PhVhBcbqjaVRalJ/Wg==:G/aWbS/k	2026-07-08 21:04:25.878941	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
152c89b6-3440-4f2f-be15-622b43f120b2	enc:v2:bOpLMMfzRatWtI/HBIgxrE2ThMYG65fz2r5p9DHsO7g=:1/feeKsiRPjKxtEY:+eAY2MbqwN6iecL9sNTcbQ==:Xw==	client	enc:v2:3P3rvcMDiWvo9K/jizs1DoAR8Ra4xXrGM9TW55OF+XA=:FALhKHoDwX/cEbIZ:Zd3Jutdts86c7TJhtl0tdA==:JRCUCCr6	2026-07-08 21:04:26.136497	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
a9a93b82-28a9-445e-8ecc-f0552071c381	enc:v2:ovRGFdpbs9DINGjVGXyDhK2kn1ZQC/C73ZcD54W/EJ4=:D02grvtafj2m0jmH:WlmptV8woyLP5oYVX8VmvQ==:hTv1	client	enc:v2:V76k3o2IdANZUmjDfDpm3wPLBT8Wjj1gr83vdBHYAoY=:Erz8yWtJwaisvggU:X+R4H7SjZ4MxcIdWL/3kfg==:7s5Ztim1	2026-07-08 21:04:26.331603	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
78009ebf-6339-4093-b746-72da083fd483	enc:v2:goQbpfELIVRZpzEgbUNOCT3HTDIYLsjU8Whht+prAlA=:BITvbi9WzIWuCZ24:bVwfSoSNuvZPyUeN2FSjQg==:9uI=	client	enc:v2:z18myKIPCcvSOhNtxpg2o1xdpYLYITBde1IiPvW+d9E=:FA02SJ/tvcUeTZ2I:oAm2T7aFpLK8UJcK7YncnA==:Wl1eHHkS	2026-07-08 21:04:26.431024	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
857bef15-b59c-4fb8-b7f5-fa41970c8b7a	enc:v2:/pEcs0vih0Vr7O0GkS9Siz1YT1dNS3wYPc9q+iavzgo=:6nI1mMaBgMkl6zce:K+zajOlfHDN4EsOKJLJ0VA==:yMj02Kg=	client	enc:v2:4OFrdbvvXY9UOWZcdf4sCC/oRlhIV1WzuXMJve3V7w4=:KGc/3y0wKcAzzO96:8dbHfIgijlJGXRR7BH/I1Q==:fGKwg04H	2026-07-08 21:04:26.611507	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
3058bf8d-d299-4dcb-b8c6-1c9e5fe9987e	enc:v2:Wbj59lWaMC4H8B9U7tsDQhYtlU7jRNCBQ0uTIy9IDJc=:D3Xm+UzTEbHP/zn/:s76WonOUs9kNSy7EZ3j+rg==:5sXD	client	enc:v2:eAvH4BIXq1UcxeygktykZGgg2VqtsxmXQVR2cYB86Iw=:U2wQ5DfWYzxRkJiB:AFhVX6W2sHgI2lCkqXax4A==:rjPYSYOQ	2026-07-08 21:04:26.701477	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
0fbb3818-78de-432b-b48e-49436b339034	enc:v2:aRQOHYfhjHNtKi0aJkn1BUNBfXXP2ot6c3peOiUdFZc=:1EkrYPuS97eEjoVp:kinoMO/UfRHZCHmbBTdnDg==:gg==	client	enc:v2:GOEQveIfTdkKN+rpTnqiOkO4cqALlfAXtQ5QPJtcPHk=:2iuzsCiHPtwD2rsJ:UCUJ7zrwuE230DGBY7GHbA==:gZXGIMQg	2026-07-08 21:04:26.842425	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
fd9ea8da-2b7c-4a22-b6ce-78df10e11956	enc:v2:H5/+E5R8xgYl3V9fA5wzxZmxMwuI+XFJbbyhFAe+hlw=:kjA29MWofgXaqh44:Gt9CSshSaPy+WJFqOLQbKQ==:daQ3	client	enc:v2:cc6c/2VZn5TcSwt+NuTlbfFqKQTeUlTAJqB/XDR7Bvg=:7NSE6O7x85RFJSZJ:vPSV1fsxF53LDP8411fKeQ==:syyztiQ3	2026-07-08 21:04:26.966048	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
8e121922-87fb-4b5b-9d43-c45d0f263dec	enc:v2:YHLLUL8H0MspAXFR8EdJ4H+PEMvaxsv27NW/HsLpzn4=:6fFEeiHibp/OqJ5O:N1yGqHl7w61AvioCkZXboQ==:Guwz	client	enc:v2:hfwI1gQ3kpeulFZ7TEDE9tNuE9jsJ62mi9l7xSagMH8=:sqtVaOgv7OKA8IpY:cHuK7nmjBAnLJqq4+6QtYQ==:L/S055/c	2026-07-08 21:04:27.597033	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
90029848-ffb2-4f1f-8c62-7368bdea1b96	enc:v2:vUsd6jLjkaxtXzmtNW+X9xyrTiLlEfcv8d/NzjEVZpY=:ndKf7wKTdviv1pUk:piykpBi59dfwkcR9Vk46Ng==:v2QP	client	enc:v2:3XIPvZZYRCc2WQwnyCaUwAe+Zj2Ur5O4DcpsumypYeY=:sQIBaHTFf2BePinx:TtTG78oHQSlv/w6+uSwIxQ==:6O16MCwm	2026-07-08 21:04:27.702318	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
9593f0d1-229f-4f72-9236-d10a2f6cc4b8	enc:v2:ayjpuAi4wEoB0VEK1O/7sPHm3Q1dHIBJHJ18Wkcof6o=:tn0D56U7I3QJ/ujR:hAm9gP4B53TBcTTep9plzA==:5vE=	client	enc:v2:tvOXDTnuaG5f82/xoKEWmVtilDhDBCjdUgoxxeJKXMA=:lfa9Kq5k5NoyMS5w:XUQxgFeAHqwD+vVLGHpWcQ==:s/KVDfXg	2026-07-08 21:04:27.82948	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
50080285-c155-4a0e-b934-a56391fae722	enc:v2:l08EdFyJT2k93xoh6eDGe5MeTTiYMseXszuyUbch4Wg=:h/K2u3gWiLgPykeL:BK7Na8y5uNQyQXwYASWgRA==:qw==	client	enc:v2:PqQTXliZ+A009eEcmnr6fHClnTeVDnTJK6ogo+CZEdo=:iUg5g1G6Z8KBh/kw:CuEUuNwmN8oU6cP/FQqQsA==:H6ADkteG	2026-07-08 21:04:27.966368	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
8bd58ca6-cc27-4203-a378-26fd3169dbb5	enc:v2:NMzViNlTXmURqjISOX4uY+XAnnlZFFhtA+1VMjm3l0Y=:ap5BA0VuAu8WlGCp:ot+JsG6OTQprn9kSldW4gA==:+Xb8xg==	client	enc:v2:DTOy2+wOfOposvCdvxdgreps2SgxSM5lAzOpXRBFeIk=:sv12VX/XdramfV6D:62pdVV+kVMLg/otZheoiSQ==:Pq41qT0f	2026-07-08 21:04:30.733923	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
24c317d7-683c-40b7-ab80-9e33fd078f8a	enc:v2:lJIMhZalujFyOuFFOaA9mULlnHM4DFMcwj9g3HnngVM=:Tur4O/5cwVpA87fd:/CWwjfKnidBTvkIhSyPIQQ==:Gg==	client	enc:v2:sEGOxtLvXP9H/1ngWSclkPBrlNp/37IOAwN9CmDzI6k=:tQgYbq39RKHprXHB:rNIXqpvUVVfm23DU0RDYyg==:RgIoZ1IX	2026-07-08 21:04:38.088662	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
2f7fe2c6-c82f-440d-b2a8-adb5313e4494	enc:v2:CpWAcdjJvz0aQjEhUF00/COJcL+K+xZoqM2WeAlosgY=:IJk2DQGDT1dzNCBw:KQsI++X2AjJZ9Y1aP2MOSw==:2w==	client	enc:v2:nlz4SHZEa9+guoYI96xzWNzXNoialifk87irDhsYa8o=:dEiDL5KIJdkl16O4:d9LmWrPkd4BGPdcTe2WiXQ==:6m+W+trs	2026-07-08 21:04:38.905617	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
1b95c744-ea71-4c26-a6b6-4bfc73439d3f	enc:v2:3/tD9JqMgfdyRA4FR5cNpS1R5/NOOVBtznqTo9Xm2HI=:X2ECLuhW3PQRfxgK:EtLFOoy6OUvhkqfkGCsuSQ==:Rw==	client	enc:v2:YCtJo7qfiKwhegeZNYVqZ/vSO8RkjN8mz3v/i9yAI/8=:/VpI24y738rz/aYT:5X9q+L8bVnGCpAlaK9iykA==:t6Z9f8Gw	2026-07-08 21:04:39.743418	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
2396a032-192b-4d5d-8f3e-5531514ffaea	enc:v2:n+Heg+JucaDHkEyBVBYSxuCYF/8s/ZGb55xeAn7rUKs=:vy0foCqDGqtWW0WE:hESU8DLtx3yDvhnhEYMQ+A==:Bg==	client	enc:v2:SjMIazXfNHpa3rbeD6EqepsiXCLKFkCigHNaAEW7t30=:zIoGsUJ2hFJHJmrH:YFDWLBYe6vqlJzvb3SRoTg==:o7bFOzoG	2026-07-08 21:04:40.006672	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
9f2aaee2-8da4-43dc-9068-1764c4195b3b	enc:v2:rJ0LYJ7dcYK+nXW7rWupj+0nwI99OP0ndqV6pPi8DVw=:8RAoIR3dZGMGAktV:uFMvSgGbYg8LR2ld/vmCCA==:bQ==	client	enc:v2:IW6tPG9hBysgwH8C1dEGEwJ4SWgWbMhGp7EcZTeHHpc=:acfQMn6ZvQDy2yVn:SywCW1CwkGUqGNfZV1wevg==:Ab1qmXNZ	2026-07-08 21:04:37.351038	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
9c24e8e9-2ed1-42f3-9c5a-cddc5a0453fe	enc:v2:TTBLafUVF0pD+2QubL5erfDxYQx/QaJRfTl54x8aEh4=:qSLMbPnDKIbkMA7q:FBZ//ptAN5NvgnYSIt3YRQ==:6w==	client	enc:v2:Pb8KrirFfG3z6i01j0WlbBCKvVu7FK4MgXb2dNUYLug=:aBBwkZX/k8vxPVbY:B9QeFe1+jBMGxnNxIJtpFg==:20GaUafx	2026-07-08 21:04:54.287123	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
fdccd3e8-88fa-4d47-aee3-f3aaf20e6f23	enc:v2:hFD/lkaZ/doihsn7jtF2PJxL4fDdzfIo/nvHLwOc0qQ=:GQBfaRQwK5CFzC0A:5/inEWwSwL+fildDi2/LiQ==:rQ==	client	enc:v2:eN2XFEffae6E4LFzbZEy/5r+REtOS6tPncGJrhp5X4s=:d1MiBgl3c+JX8nKy:tLVq3iRhpmRzAY3FdMmWDw==:XJNKpJer	2026-07-08 21:04:54.558991	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
51a93930-3036-41fc-92e3-2b7f45a0b1a7	enc:v2:0PzeuTb/jOOCKTMOjhps4gpXYHcdrPh7cQmCFBXrI5k=:3yzSUHvPiQSbhaK3:tPmL/KG+JzgMjyMMrCfhcw==:Uw==	client	enc:v2:aidqHHQuJg8ngJpc8LOzUyx0ETYhkP968hmvVW78ej0=:wEtYpzpuuufntlA0:eihUa8Z6Biml3MPlLlyPKw==:XHFzbcx0	2026-07-08 21:04:54.68549	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
b3e79e6c-2ebf-4815-ad5b-3d18a10fd491	enc:v2:a8If5LU3E2PEMSRf6uzzh3UlAETkx8XmXChYJK/vdVc=:qg5+aabvI8P2Lohk:Y7b67K2Y9xMkCHe319Hr6w==:8Q==	client	enc:v2:641waLnZHBX1f595m1bDIZWIx8HFCa9yLI2nxk/yDaQ=:W08VIM93YaIr3T0a:YgJDQHjggIJMJFyqpsdH9g==:UDaO9W7C	2026-07-08 21:04:54.837876	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
a4ff748f-0daf-402c-9985-55f275311ec8	enc:v2:8bZj3bxNrjABlypdi/KiP2lDM9dieTEkPivHzvNPxDg=:ZzAq2ag6G8RM2uUv:Evplny1tlPDBJS753s9FaA==:WQ==	client	enc:v2:mquFHWupN8BTXC/fUhhgkVgLx5kpc0tbX5TzWyMiPuE=:A+Y3onZn8MrZgdZt:N0zgzx0GToFs5Do0bOcCuw==:3GtKIVst	2026-07-08 21:04:54.940816	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
1934b68a-bfa9-4c06-9acd-2a57f2e0ac42	enc:v2:dcOazXKbCll6lyYVyZRpk6Fl+9YlfE9rmH9LoP1Hjhw=:qkpKG9SyyWUfR7FY:34qd90L1aspXlrdPS3T/eQ==:OKOB	client	enc:v2:moXcTmR77BeLVt7Ej9XWmUvuk0UxN4oJfAXDQdlfmtk=:hRFoSrcovTm34py9:cuPSkD6Ay4+J7rJM8T05Tw==:DBmKixkq	2026-07-08 21:04:55.44731	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
fb2a6981-a1d2-4e9e-b1d1-a44ffca543a0	enc:v2:u8MMNj9UBYmFOOlxj204fbStW8R27OQLNjPS/rghkxU=:PfEAOzB3y8r/Cr4p:yryY8nyNT5BuYV/h9UopQQ==:MA==	client	enc:v2:QSyuGwAZOFtPNv81rGmQZYBt5Qu2OeSO/i1/MsaeINA=:aAb05S1V4K3GGHnL:4mN+OHeNtR2p7+wzGJasJw==:phej+rmY	2026-07-08 21:04:55.559877	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
77ea5585-01c2-4302-a0bc-080135b73259	enc:v2:3HHKuLpWo37bX8YKzmDZ91b//KOPsxPjvDXcqH5EvbU=:LnXxdWdK85QS60Ry:8kvz5L+tsS+X3nIwzof+UQ==:eA==	client	enc:v2:qN6nA0WGz+sdQkARGuoP5e/1TR9RqKa0jxIgGSJpswQ=:svIbQ8UMkTj1eGlB:w/iFyizHjYIC9Lwx7TsHdQ==:bMLsY5bO	2026-07-08 21:04:55.739787	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
52ab2ac5-01de-46b1-a4d9-ae636d0bdaa8	enc:v2:quYOoSqJ+1zGrUzd6k+P4NV/R1cKU3cfos3VExOJiQ4=:h5vaABcfqaPt1VYX:rxOCkska/cjTXK+C90TTpg==:YQ==	client	enc:v2:eJENPl/qIIDYhS/PLjCVotMcYVAmN1WrJZKkpKqidU0=:rcBVSjBGe/KwtkP5:0lcY1m0v9kuvHdzW1f+V7g==:IbVHcn/+	2026-07-08 21:04:55.927499	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
82277fc3-37bf-4627-8823-73aa33b1e67c	enc:v2:/AOM5DCgKaGxpLATclPKdQfvgZ6slFzzStmXTeJ/tfA=:V9Pn9etvEp1AxZBI:G3VMc6FT+D2y59/pVrd40A==:Yw==	client	enc:v2:4laQ9M4kCCtzdfWnO5Og3Quurq7gQMOEHl+myU0PmP8=:HW1qM6Ph0vy/KEfY:zrCkRpSIItR9dOtjiWIn1g==:IgWyup3U	2026-07-08 21:04:56.098524	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
a8cea2e7-2763-42cf-a1ed-49cf5f229f83	enc:v2:hXs7r8zHaZaWfcbs7FDPu8yERHjYvJoflcl5vDxaSpk=:fp45jDQLQePBXQy2:IPOhdu2GA15EydltVfLj9Q==:7g==	client	enc:v2:VPD1AzVy/0fhbaQAZZB5btinsa7ij834Kl+XAEVSG5w=:os6y/DkEe3wNOmHn:h4tpFo8RqGxX7SofOoDC+Q==:pZ2jJs3b	2026-07-08 21:04:57.934872	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
68236099-90bb-4290-b46e-5ed67bf10e7d	enc:v2:/knv4RjliepxZUg5N6AjTuJPicQnoxFF2Y/ZDUnlKp4=:SAfy5GMnxPrbjbSq:4t2XFxOgV+DfLAq07DKuhQ==:Bw==	client	enc:v2:Kfa/E89o62ARCwITf9VKfMUyPV13Ca1KJC4QkwdHU3w=:iLiikPlV2W76Dov9:B/8NrtfG+WzGZOsiYiYB8g==:daPKdGKo	2026-07-08 21:04:58.046419	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
e7b0b9ff-1029-41d3-9caf-7d087ed4476b	enc:v2:ZxghFVn5G/HmAat4kgLZ3sm33wp35f3xrJqkF806azg=:dH8WLM0ifkDM1SE2:8p9OLq7abRlloIzOB7NeWg==:rA==	client	enc:v2:M3FFQt/YLKh7m13leADNQRWUDCHf7gkQ8FyL6pLOXa0=:sEMWReIiMqIilw76:WCPYPWRqoEaZW7IodbFi0w==:Z33h14NU	2026-07-08 21:04:58.226061	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
3119933a-3fb9-4cc3-bad5-ee053ce85c79	enc:v2:O2iRB/q4rITQPoW10V+6fguugh7/t5JEquzIrfUkYl0=:6NHv5wYVQUJyX/6D:1RZZF70S9bNPjRfi516e1w==:NaY=	client	enc:v2:7JU6r6QM2ZNWCsNR2SoYXSvTH/RTsie/3Eevdn1PMS4=:PqIZ8R/2a5H8JH5D:D0UWjX9Wp/uLdE4H5ldhUg==:6UzL3AZB	2026-07-08 21:04:58.333707	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
01035dca-5fea-4bcc-926a-ee535be989ee	enc:v2:X6GUyy9GeTVcAYNX1MzLAga+3tT3JvpPTUuVobg0opo=:bpQe1jVOaBocIyEM:5FtLGp5wpbxlp8rY9u89Vw==:2aJ0	client	enc:v2:wCbAPWG7e/WRGnXxejUbbRMDBfVO4q6EtWOX4Zjgfeo=:/f26JMom5/Ny4aN4:zXmB27u6DXVTDC3dm68CKg==:lTv4XVFL	2026-07-08 21:04:58.479165	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
636ba6ef-43a8-4269-914f-856073f45d91	enc:v2:5ZZwwa4QuTaTAcRvZ6S7pPwJ78mpJY/W04cs9agzVaE=:+dhd11BUA53WynmG:vzK6mhm4nK+EeLW1FrE8YA==:S7g=	client	enc:v2:svT2b8MN3ldw/54q1G3axDNwzppE49lMko6YIhsvI/8=:/F75VzKTY6INMtac:+x5Fo7W+zFDzQj+bEZ15zw==:AH714aNy	2026-07-08 21:04:58.663863	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
8343c742-8b91-47e4-a674-45c9961a5e51	enc:v2:axy75ac/YGH9ogzDxHE0mBEQ53YQmchYnt+edPOCK5k=:bs8CWeI2bU/txgZ+:gFvlhY/BGnnG7hN8tTFNWQ==:nqnA	client	enc:v2:/1VjfHpflg/Lgcz63hFx6peRUHu774ECJ35zySLDdOE=:tYhO00QTy+YgfTjR:JspYIREpym4jZezm6C4Ahg==:unJBpWTs	2026-07-08 21:04:58.94575	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
2cde2b0d-08e7-4be7-9372-d072812785e8	enc:v2:0bm/NPWQE1eXeEExCJo+b4iVwlzE6XAI+lFjb1oi2Bg=:mCQpjKaivBS/RQqV:8J5SqZMYHQV66sV2Lh6bxQ==:EQDs	client	enc:v2:KJTo1Zgf5wFjG0Wg+64jt2nhwncBWcvedc8Y0+WlHIc=:NDrQcLBP6lzk0Waz:7SvX1aIdGyzmWEKH0sMJTQ==:zN/BJgrT	2026-07-08 21:04:59.079532	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
d3d5ae6d-789e-4b48-8a31-40fef8fc7570	enc:v2:Z64FvODnkqjPR7fCGXnTaFoEbEZjJi9pvs4FL2bsA2g=:/4wOsCokGo2v5Nsk:srF9tUcr4ZwE9/bvRsvv1Q==:LFw=	client	enc:v2:OnN4ssA68eZJncLa8bGfaME4QB6vUZIF7abxcz1lBg0=:No68N97dQ6+qgMk+:ZSJnbPj0WPy/MJk6Zyzq/A==:eHzyUTD7	2026-07-08 21:04:59.231312	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
584e7476-2fc3-46bd-8439-9fcb70ef8f0d	enc:v2:tEh2LRbfB1jOtT9JR0kTtdKEjj/Tf063AZfU1tslnow=:4H+BBzatoF8S+wnn:dZ0VwWEh0ZpgcMbj+r2M9Q==:zO0h+Qw=	client	enc:v2:7ABdqkGQmzwu/xHvStSgBxgNrnf74GWY/FB6FoN5XPc=:PB9RU6XR6ioOtvRs:sWoJcRmSMvQv6K4oGo3hCg==:a5M5aync	2026-07-08 21:04:59.435781	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
61826506-e5a9-4927-b085-9561909ccd9b	enc:v2:0cLdsJfzjYKRa6ZqLL9MXi+ItVEv7h6XqgxSqFWztec=:foPY/o6mTj6LfaTj:kyb9J8o31BZk9w7daSiyGQ==:WQ2x	client	enc:v2:5nWbJs3LjQxmhvHGH/Nw63NzqrYOAYNIy12f9zcIoXk=:7KFUPp4oOfmd/3fO:Ay7jfU1zNFXfbykXZ/YiZw==:TqLrPEoY	2026-07-08 21:04:59.509998	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
27072cbe-81db-4e57-b5b0-68bb003e5bf4	enc:v2:jtIehdIyZZFdSmn6tB3Vt37In+eBPrytWZK2SiqyFUc=:9HnZ4PxrA+N2ixGu:WK2JLXLSFEG/CH1bwtjfgA==:LA==	client	enc:v2:JB9mGUeVP09nO9n4OWmCB0kM29XsBwsH3fm8Ext9kgo=:jKUolkucuD5yP+5z:fWj0NvR44j7OYNv7tl697Q==:Kgdte7U4	2026-07-08 21:04:59.654353	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
dc1598f8-937b-458d-806b-c877a46e1c4f	enc:v2:TMfRKxCK44M4ioPqfvF8/T5IuwRPkeJTTkkoexInhOc=:6O12tQIT4ftdVG7S:qBhVjbcvaagA+9AV77FaVg==:AjvB	client	enc:v2:2wDnrpjrdOjoeVL9dCjHn1q5fcug10n1VsEzopjTcbA=:8o41LZr7Sz4KZSaU:Flot6VT6bBaxPtVCgtZ3FA==:QJGsZ164	2026-07-08 21:04:59.872401	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
9f3403b8-9d0e-466f-bc10-d308b3ca0a07	enc:v2:yksjWmeAaGskCzNPmcG8sGTEpv6bm+YUJCfIGq/CTnM=:onK2byC88YBSFyqE:5MAGvFaSyWTssH9clNAstA==:5A==	client	enc:v2:6YtjwDLGlg7U3upkR3ePOSJFbIa1UV2TPlh9cweKi3c=:53BUY+wdhGpcXq8t:uWOCS9QVSn039MT9HjMNQQ==:m4988/a2	2026-07-08 21:04:57.413028	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
10bac173-9171-4978-b900-b2e0dfb23da2	enc:v2:3rTSye9BPueZkwWjZd3JXM4WvSFDZXKQAbj28vdeNAs=:k+kmSmxCNZJxrbzy:TK/OOMncNjcmVWKDR5caFA==:Zw==	client	enc:v2:OStrnIe3YKBZ5FnsnwPjQUZ/6xyUKTRaPukeaJdPGmg=:24PyrDbzVErmSiR3:XdvSGhOOeJe4jH9GzBKAmA==:16FRqlqP	2026-07-08 21:04:57.506849	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
5399094c-a26a-4fa4-8269-49fa89196f44	enc:v2:YSDSGG3mOeyObQyGeeVbO5dt7H1U8XZTbCobGWoKXUA=:/xcd+qjyUSA+aWqc:PyZvOkTyHd3u4T6VseqHBw==:vw==	client	enc:v2:ZTe1Yg3wi7nXf3rDqiWNO+bRU3rarWkzjPgb972VNz8=:BUugDXG3+EnirkUY:iTbOCUwrMNEIY8jDVQroUw==:i8JrfbNI	2026-07-08 21:04:57.627976	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
bfe186cc-dc13-4806-ab4c-f4e2fe71b679	enc:v2:ThT/EDRfCy0Buc2cUhdULOyHoq7ZVwNd+zAFSRSsM1c=:ZIyusaV4ahksKNTK:U4R6bkql4us6eOrXe+qdhQ==:XwFt8A==	client	enc:v2:xD0WTOit1UlNKeEDJ7r3SJ3QehKC9daInFHZT09FYMk=:VWqi3N9oKZhfBQoo:PJ6Mpopstf4R/+cMR/DAVg==:9SVi2XSO	2026-07-08 21:04:58.852164	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
8894ddcd-7c14-4dea-83f9-6e24a7962ecc	enc:v2:NEl40YPgiJ8YFLWp8cy3mpuqUyLd33VFqSdoNnXMklw=:ayy4rVoiNgOMSMJb:/tXxuI4zAd1HfnrYOOL6ZQ==:cQ==	client	enc:v2:hwLRc7F1pGJlG+rqvpuJVke7Vtie5AceXjXNIWjsppg=:W9ljWVWybtXa8Qef:PK15KB6XQAM9LslaXXs3Fg==:hGUAhRUw	2026-07-08 21:05:03.253059	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
be15dc5a-f458-47c7-bee9-ed5742fa397f	enc:v2:s/nnu8Ag1H8K20nM1JmM65Tt3N/OZ2zHLqjnp0Z6WC4=:kKaqjKSDpxysMSed:QN2RV1P4T6HiXn89c0FoXg==:JQ==	client	enc:v2:AxGtjx1Uaq4iMf1yhja3MzEFx8iaSwOZrrRhGigMkw0=:EHhibo1BJ6lyiI3B:pkGFcK22c50tf1BUot6zmQ==:AVQcRzw0	2026-07-08 21:05:04.990539	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
1ab70549-a17b-4e67-a89c-6bd467d866ab	enc:v2:vw1Fn5vElszuSVdFySkrd+mu0tFbuSYulb0yEFN9fS0=:qPTVjkd7NjVKMP/v:yTT5StqpHJakqbKLJchwsg==:lA==	client	enc:v2:JEu8ZAvQCSIbVwygG++ufeYgqZBmJr2kuKycCp6GqUs=:lyw1IwhZrN67sypT:GbLtXZHE7/i8AecB0+ssMg==:0FCMe7QH	2026-07-08 21:05:06.429897	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
d3e188ae-efb8-4035-9755-833f09200b1e	enc:v2:cVIZhTyFIk0yrOSHrdkDwYYE7UvI046WeCLt7aRTRL0=:gB3w7i28oZYu7vrn:H7+SCBhTqY0q1gvjnneEJA==:qA==	client	enc:v2:bROf7S5ROcp7eclLM+JAA4Bii1OobXvBAzZV5WS7eBU=:ixTG/Ko8OWRSWsgm:ujM707xsKG0rGq1cUcjZBA==:/mLBponx	2026-07-08 21:05:07.680239	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
55656a73-8cde-47ac-96a8-fb0b2dd41a1b	enc:v2:7+3bW0YiGqEVAQpbZbww/A4UoN40BaQ99uLaC8B4SI0=:M88kwBgibqQ3tzu6:q1uk6OdEa3S5EnOf1UOoxQ==:2g==	client	enc:v2:9rL2M9JEDEfVQT4MxfuRkdOaVpxP8N2IP4hKq74TBfM=:3yHWa0KRRpRNFbLf:tkaKl03S4G7EZwRQyHwDKw==:qPuZ+8Ek	2026-07-08 21:04:57.685942	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
9d188967-8823-4434-8ba8-c7b71f9fc381	enc:v2:vxit9BGhUFjxgknw+X2pOxj/y9SufbTdh23IJQy4m0w=:1bvN1ivwsOvjSeTc:96P+0utkMuYGK4aC2jWD/g==:Xw==	client	enc:v2:yklH0D2s9ihbaXOXBWvo1snBc+UUuF7fSKWyWcXJSug=:hGEFtxxIZAin6AUO:64ETO/48RENG34eyXsC25w==:WJfDrvQV	2026-07-08 21:05:08.830571	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
dca9a4ec-dd50-4261-a05f-fd574ab2caee	enc:v2:sGqNRubwPw+8BATxW4m3asVKz5HO6bfQVNHt2L3g7JU=:h7148zWdzBNLGAqQ:ynjYjq5/fhCBfbVWB1VRqQ==:Hsw=	client	enc:v2:7gFNLJ9obKcz82/tNtudLBQ425HIMhEqAl1S5KsEwik=:ucfTWMGY82ShOfip:NHsZ5Fkd2xyfEhueZ0iJSg==:BfPXTJ9F	2026-07-08 21:05:13.60534	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
35119d62-d28d-4c39-b27d-2fd6a8c41484	enc:v2:sQwHCKe1QCGjo81BSAew7jAB/9jIv3apLMMvUkGz6qo=:DQ2AyISebiBH876u:r5djzQKIsx8lrOnPEIFBYQ==:HA==	client	enc:v2:wdAoZQQJo57wMPWxguADteg/hpPPtNbkm91RkbecRYU=:kX6u+QM0MIJRjl0h:6cz0b+oBIyL2R5/hw8UIZw==:8NiZaazH	2026-07-08 21:05:15.72725	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
fa304371-cfda-43c9-bf13-a3f0c712637e	enc:v2:bUsGDMHkAYKjXGRt+uX3xGe2lJz3qCj8nZrczje7et8=:ZlZ/OeeEI93vNaAO:5gfzZCMflfLjxPPSqhR8bA==:Tg==	client	enc:v2:L695ZUFSA1IKGCHB/9NrwdYiOUagl3G9gmvwPXRifJQ=:+fu3k4NwlLTs4z64:l2a+DR2gH7Y3U+lvruwKWQ==:jjXcipb8	2026-07-08 21:05:17.23887	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
935162ec-4491-441a-a506-be837836a673	enc:v2:Y6c8rMy9qFUAl1xmo8JhhyEBY9Y7jjSx4feZT+q4ta4=:V9Od1acwl9I9bR3q:ELa/p8Stk19sY10+t9RvVw==:pA==	client	enc:v2:PoLamTnzczeIiFBVg4SNTK5e6W+vDz1S7heDJa6Uotc=:B2pqWv5P09pIOViZ:GZsLSp+gm2t3qm6B5mJLgQ==:Ssq/rnam	2026-07-08 21:05:18.654479	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
51cf943a-36f4-46aa-a6cb-83ee5d640969	enc:v2:x9qmrNIGycKpk1hPCcHL4yrr7ZSPX7qPq3YSTwVQ3b4=:ffiA25wvbJ2+DBcS:6U3Vb8vp4bBNX7PGRcYKPA==:3Zog	client	enc:v2:v4Rv4mQz96BkgduxAQIzePkUBKUPEntJFtOcsiTaD/Q=:BCTXrtOxq3jAx+eK:4lc7A/supp+Wplku9ZOjnQ==:2HnEBM5O	2026-07-08 21:05:19.557376	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
a366c4ca-ae8b-40d5-aeae-2c8dd1e45df2	enc:v2:qvGWSKfykq2iuArwaF0WTWPDSvI5JNOa2s5C6SVHC5M=:KelWRNqdHhRXA0dV:nVOjhWA/LM30f30G/ywhgw==:/pU=	client	enc:v2:TQkaXORY4tdetXC/1FhocizLllzKpTVwHIuPEkrFt6c=:/pQSrcCV05bSn2bl:vZKu++0YVqRefFWlzZcidQ==:1r2x+w3x	2026-07-08 21:05:19.685358	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
ac6b1a41-a71f-4373-a744-06031e6f798f	enc:v2:KBKExglp5pu6fqzWVmhwgOPJLU2rYaEi0J6mMwdXSGY=:BgyOYzrUSB9CppRP:DQ9LVVU41YK4Ahvt+ugT6Q==:T8dy	client	enc:v2:3E83wJnQ2VMooKDLN4kQbvXSm3Y4YPeJN3IzA9nMmhM=:4dz2aHcmYgRDa6BP:GEVjIkAmCAaGTaFik301Dg==:ijw4FRMs	2026-07-08 21:05:19.81489	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
6777e8e0-d8df-49b4-ad4a-c5917ee348f4	enc:v2:iP+TyO8+qdX65RS3rGncPGz4y+G0SKpq5j08jnjMZRI=:i/mMaTihofvxq6/G:05G7bMOIgrmYQDR4tVPiog==:yg==	client	enc:v2:RWXAkItmi0Uwwf/7uEtxnd8LXAARFnv7b0PvC3wVmxA=:6Tv4wRFNPgUEEgkh:kb0UrWC5mBhjrJR4p5Lldw==:MsWQmEFL	2026-07-08 21:05:19.945748	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
06056599-a77b-432f-9c80-d78826c725a9	enc:v2:UOdaMcC/FU3ZEIiUv89I2I8NpTvRg2JDm+JThbbhcnc=:x1oNeVaPLcVVUmPX:dMZfm2ScjHqiYVhJ16m7wg==:per9	client	enc:v2:Qi/O+Lq4nJKd/w/SmCU57U1TMnOBZpb/laUqow6VmUA=:cTR3E4FLFUhQPXcs:BV6LIQlt8uv9B7yEdjNu5g==:kvfBaVFW	2026-07-08 21:05:20.101591	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
2acff22e-3a42-4210-8f56-490ebd351976	enc:v2:Su+Ubw85Hc9Wql2FDy3MrElfedjTqlFi64TPf2vndjM=:PLRhYSjMK0aumTgk:XGQYyNZfP3bEGcJp/NWe8Q==:3tY7	client	enc:v2:4qD0eOx2aurD6PLfD1Q/Vs20QHculFkAnhS06XRMP4g=:LjOGHmaYUp9p14Fw:TdROuOd6EELtkT5eaT7HCA==:8vEAqkR/	2026-07-08 21:05:20.194875	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
13b83d80-b681-494e-83e0-c0fc3000957b	enc:v2:oftnsO9jqiM03A5fyU4G9ED0lqCuAf98QHzP3/7LNo4=:X0Xbm3v5P58Wdmvm:k/vAk8OV/Jc3jdfzEEA5VQ==:B44=	client	enc:v2:O2yhodQ2dKs3+1/Md7Y54n6hF09UrdmYNEqyVlqF278=:ZWrZ4B/o7J1avO+7:v5Jdc6ABzWPIxEZKt50O1g==:jMPliAed	2026-07-08 21:05:20.348642	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
1fc5e9d4-84b4-46fb-b4c2-72b71b7bd6fa	enc:v2:nITm8qLptOJXQH1qhCr+tdbBUoXY1OoVinfrvSjdzvU=:dW7/QWwW7I97GcX8:U3prlzwfYDD6jUB04Wac2g==:wA==	client	enc:v2:HuD8lQAKs0/vfWSd6P0u2T4qBOeWdomP0Nr9+gU+RyY=:WaHpan574+uKRFzx:9uRmztOlxtmnexzXwPYYUQ==:IO8fApUX	2026-07-08 21:05:20.620805	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
6bd97ea4-b80d-4c91-bde2-440fed8238fa	enc:v2:m5p8sZqM/G2rmc6bZfw+DFBPkhRNrf2dCoaiTle0aXo=:fPbbYJwmznrHIXoP:vaaWM//L86RhMdgJ7sVgAg==:Qg==	client	enc:v2:Fdf7I1OsoZKNcrb7HkaaDhDcNdbSgXxyyxkHOFMpq8A=:pByfwItFBXZLG0i8:IewglhD4QwlqFsGCNW+qjw==:XasQvVFz	2026-07-08 21:05:20.716463	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
ab4503cb-bd2d-417c-931e-c3cf82220665	enc:v2:D8AupvRj0w9pECssaxfiBoe/7RZBSzyXzZO7RwzePoc=:j6DUZAbFU9CZm4aC:mKmhemDqePcIKBvHMtX6Uw==:8w==	client	enc:v2:UEa+tp5xIea1oH71YeMQwUOnbNGxT15MRWC9PmoLbPc=:1LSxKH7OrPphbtH2:In9Ipx6j2pi5mN3mZIocqw==:AaMdQupN	2026-07-08 21:05:20.829403	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
20ee39db-8cb0-4ed6-a07c-571076fdbf45	enc:v2:I53n2BsrV33iqrWs0LM/HzHJWUH8s8fDE5063G5pHyM=:JqHKiSXma3CjO95d:AlIt9+kDULC9mVLXbFxJRw==:Mg==	client	enc:v2:CeQKrwuWlpVwhCNVKIsoq4JQWqymKgMBMRcahnGyy5U=:w/OFGxME1BTO6eIl:lU/qfRtxXnI8NiEmLt3vJA==:ObBrQN74	2026-07-08 21:05:20.950149	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
f9af0be9-6729-462a-88d1-86942f74f83e	enc:v2:xexb38RCr4gBhzL8AB2T8+jBpqALo7kcR4IorrmnDso=:K1hqVZhWo5UMdefE:bVb7bcKB652tVgDf+qCUBA==:XA==	client	enc:v2:a1f8M6W10SA2hZwcixSNkgUqFEzk2G1Y3HITUyy9RDw=:VMqUltSohjpNDip8:tbJv9c4x433ZWX6pZiiJEQ==:U/hfCtrL	2026-07-08 21:05:21.122243	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
237525d3-6fa0-4e05-9f92-0b626f76e756	enc:v2:UcujvCA0/X1OLfTfcAvF6v6gYrPByxvV+3iMbFvv+qA=:QS57duIs2E+CEyQn:Q7DEzht4yOnHQW2YHGAYRg==:1Q==	client	enc:v2:v9l7OlZrdXgION/h7yqVbeGf6fps9g1Fg56nmcddZT8=:wyGLWHyywNmTBDD+:24hJhmvAzlY8d7cdd5fgJQ==:oudIfTFw	2026-07-08 21:05:21.325688	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
df435921-cc64-4349-b580-7e7e9beb6cdf	enc:v2:SV6YNK/I/C2eku9U1wPrqwJiXi4rDJ1t3SNiv7htgTA=:CNR9CrD3bTB4IKYc:MG15TrlkfEAaPc0nJl/eQw==:Bg==	client	enc:v2:CMXvSdKjrLthyNDcjOOfI5/GD8C4COPl23ViRXYBJXs=:iMoOqO5UwvhUBE3l:NVz9NxR/ZCSv6QBYwPHj8g==:2rn6o53h	2026-07-08 21:05:21.460574	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
56482fb2-5f31-46c2-8281-9054741985b6	enc:v2:mvKHEHfk9SCU9uzY+4jUBcadr5OEdXZepHa765Y1sAs=:C+Xts+sup5wchaQi:RL6mBNJrfm6xBKW5obP3RQ==:EQ==	client	enc:v2:6ED/L9fyzWeZAJVZEUmfJ2ir7WPa8xtyKy41anIig/s=:Jy/C/RJ4QHV3XsY0:jQeL9Thkm68Ik4vSZyFpaw==:DSAEkZWz	2026-07-08 21:05:21.594069	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
f2eecb6d-9a48-490f-9d72-b9a30a31322a	enc:v2:aU/wIZYSUKZL9UJYqFuim77fiy0Y0KMTWHmzK4wQR18=:pW8EssY98CF6ThW6:kuilRGBYgdpQVCfS0OrD7g==:BA==	client	enc:v2:YZz0u6zYG7yTDhNxosQ18jL7jG2mkDkx7OlT9gjV8XM=:eK1cHwVXlwvQKujV:kynBSPq6LQka52Vdod334Q==:8FfL+nSR	2026-07-08 21:05:21.725522	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
dffcb22e-03ba-4433-a3fc-9bdb51bcba95	enc:v2:DJ/9+rRFNma8BbJhWhuXaZ34Qp2NOPvighbl/BrHxBg=:W3rzZ6YpgQyPLMdi:6x3F36E4DdbzynPftWlswQ==:gw==	client	enc:v2:r36uN3EgGZeLk/4SNHqMXuCDsxWus6puNcxjDhaRHec=:M6awWVgv3i7vQISh:lK2A2g+eoagPVA5N6EddsA==:2HweEbHa	2026-07-08 21:05:22.056692	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
dced3c18-a415-48f5-bfc8-00eacfe20e65	enc:v2:D4h+iAlh9jrfoUueVy26ESxsWvdDMCOp0WSp9Zsy7fY=:2zDdyuAzyGpNo8mu:G+WXTil6OPyjNeJ8L8Zb1w==:pK0=	client	enc:v2:gXYHqcCsFSDPQ5HxwtxogjGf1uM5B7DGIPdFwSERQ7Y=:DFzfYJ7mVPFIziZa:eNmEdWnmdMDTYy9Itic1tQ==:1I0yrEgP	2026-07-08 21:05:22.180261	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
4c770071-c513-4864-a18f-2be1ef2fce45	enc:v2:T76+VJ9ULTFQbVmnkwQkbkzsuR9+TRu1zje1ufC6dr0=:gf2CCv+iEO7EiADt:yJm5FB+1bkMygTJduWLtWg==:DnU=	client	enc:v2:r80z3IzUpqzui+NZUdigvDw/gs38A3oXyjOS2AX503w=:D3EudQTqs9lJa1XM:5UjXy1yBWCh9A78Qf3AWvA==:S796+Sm3	2026-07-08 21:05:22.29319	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
6d25888c-1532-4fea-8dc2-beb99466de60	enc:v2:HEVcfAX8H6ZITKsb+Ipybfye9tdMsoNI+XRBXJSwvYM=:cxxwBPt6x2Y0egxC:vPI/n7E02T7QyalFZ89cGQ==:jj93	client	enc:v2:YJ0UBw0d4SUlbg27uaxrX/bcsOtCOgE1/ae+0IPQcBE=:Mt2YfffkYgq1aApu:MjyvujRG2O2//8mHEUbn/w==:etxuM3EC	2026-07-08 21:05:22.43891	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
04352d93-35be-4c3a-96ed-bd779cb5b57a	enc:v2:7ytfRtdqK3jG++GO8tCuqKvLNrDDfkw60xuzzdWjTfg=:Ol2zfhBUK0obE7ON:1CTNFLobn3tWrkRwl4TLzA==:C/vPcQ==	client	enc:v2:PuEB/TVoU0G0KQT7zLhm59UcDRF2vrn6NlQwJg1fxxM=:ZfM6scqXTRmTYDmE:HqCWF9nD83T19yPT8gQb7w==:WmstyMcV	2026-07-08 21:05:25.038366	2026-07-08 21:05:34.373	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
5c6c681c-8be7-404b-a281-9f83d119a9f7	enc:v2:OHPFxB48Qc95zqg9L4gqsMlUvP5uUuGvRci6IVSNGcY=:Lgfkoteh91OfZz6j:zlbp4x6aWP19F1wGNFFhvA==:M2SPz2FWTXBydWCpxSsIEEg=	advisor	enc:v2:Q8MzyikIYCTHzlerm6QNEsySV4VPVQUcqx8CZ7j2hfA=:FMlDqc6tLIgd/bD/:V1qd/DSkGVK4OT2s7x7JKQ==:qPc12SjnYnS7nXv2	2026-07-08 21:05:39.942024	2026-07-08 21:05:40.377	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
19f70b03-9baf-49cf-9982-3cf0accaef94	enc:v2:rVKgBrrXrp3RusCOgOec81dKWZgGPTvaWykuwcn7mtg=:kMzwFoE3UNULfme5:cgLbMIFaQrvstrGTStMbow==:+A==	advisor	enc:v2:TgPMi5D1e4HrSwkRwf8TEh2ieeS/y1K+4m54EDvHyFI=:eCVI+CR7HAoHNNgA:c+fA+a2+Kv0tDl3tVWdsrw==:sSt2gUHtH5D7V2Vy	2026-07-08 21:05:56.348374	2026-07-08 21:05:56.915	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
aa402795-4382-476b-b2cb-35a70f9d67b2	enc:v2:RW+kSqA6n0AbAJuT3xEkC42z4GLVjgBuPeOXFH5SgM4=:LnNIacpany9lNYs4:YloC0IdIGn5oj3bRbiqD9Q==:Lg==	advisor	enc:v2:DcJclzGdlXe3SeXQFkbEBNqo44SLL79HItXa14R/HeM=:ZD+7JdPel2O6Bgzz:DIjtJaGzsWZf2EvpX17W+A==:H+0/+dBUbzo8jegU	2026-07-08 21:05:58.963657	2026-07-08 21:05:59.295	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
8430b2e6-b71e-4d7c-9d9e-1c5ea4548b72	enc:v2:sYfPmhV4KstCrNsr/lO46NEUSWQAYA4AzvBPp0W6Y5Q=:uLO73hpAf7Pr99y5:bWPuf3rPQx07BsdpBKZDBw==:Dw==	advisor	enc:v2:wdIwGgp0utb47B4v+RLJ0vbMQut89+cgOjAXCK1r6eI=:kX4iNBKsQuwZ7Ag3:RhV6oI5M6uCT4oGAWdnQAA==:mY9IbItVSz4PHBt9	2026-07-08 21:06:00.887541	2026-07-08 21:06:02.388	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
ff9e0d8c-7d85-405c-95c2-5dcc506cec3d	enc:v2:Tg/q2gDpDIDUyljAgOddOCwaysXMDSrKr8RxgXqALiM=:IvXlenqFnPeSWzDx:214UJ3eJ0MLrJh1sAN9nyw==:SQ==	advisor	enc:v2:xsLiZl8nOHtjnSzV8DzLKhIKRK8K+S0SmUPOz4nI+v0=:iYEd8Mhwq4YGNU45:OvT0AjVuie397DOF2uwebQ==:yB90Z2FCVHSOvbd1	2026-07-08 21:06:04.565916	2026-07-08 21:06:05.002	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
f0ae8bb6-63c2-4da9-b26c-b9026cf187d5	enc:v2:1tY+H6JRPbYm4EBJbOQKhi4QRvN5xnVLVGE1ahny6Lo=:S5MuMxQjMQgjO4Gh:IK8tIUEMMbnXM2ZxcZ1lTA==:Ug==	advisor	enc:v2:3CeMQvGD3l5JETAe4zbmQG43rNd3kv3fSEpl8BvBmX8=:zG+wQ5gtd0UAPSmG:oYxPoHTRE6Hc73YWoc3yfQ==:ZCQzRXksqC85NEG+	2026-07-08 21:06:42.460178	2026-07-08 21:06:43.181	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
a679d843-54b1-49fc-98e6-76610bbe314b	enc:v2:IT2J/58ErCfkDFXxcY+tQn3Mi3MoH3TqWVOb3+Pdch8=:Qvm9O8NvbHWAHO1m:2gUr4nfQqkPbqBw1ou3sbQ==:q+jTn0caH7eJ84KF2LLXsfBME2p4bUFejxfqNv6iKaoBUee1SY9h	advisor	enc:v2:8i68UqJqrs1GJzWMIyLClJxB2FoalgWWo+zDAEiqCAk=:tZHg/gC8UyMmgYa7:pTQbrCpnNHFe804oz2K/kQ==:8/3hKbjr7qp+PYI=	2026-07-09 13:51:19.291991	2026-07-09 13:51:19.763	03c7bafa-c805-420c-806a-6e4a9e2f36c9
db4f7cd1-f8c4-436f-b039-2c386ba6204b	enc:v2:ut6BfJHJEqcssN30QvyFmrziE/EVIlTm4OK3Eddmi+g=:WSD8ps1GUArzuSXH:UiFUof2v2MF9tggc+BYpzQ==:fSBofjHDbmIiswzsPzzsrnd+3HbJHLqXY8uDwxX5KsS1myB/J8CyQCqBdg==	advisor	enc:v2:B20bV+fBBpLeO2ECmL4yGmNPEm1zK3uYeZSEN3+CSYg=:EHYFXsoxMYek7xnH:cgooP5LEs4/CGhM1RCppkg==:SKd303HVvw==	2026-07-09 13:53:08.715129	2026-07-09 13:53:09.148	941e9d22-30bd-4ce4-b843-a55370287419
40f6ffe0-b117-4960-9b6e-9d2d62ed6a6d	enc:v2:cppDWLi0j8o/3n9nYejV6n+AoOxhyXozFA7BvwcmTSE=:wtzwg02c+xdrKUn6:zoeh7UWVqpvCr3D2mqVqLg==:SufQLWmX590Cy5qrpBhoSG4fnCWOFIarqajdGL1tgIhnJXbUBrZwLiKC3Wdlt9l9C0k=	advisor	enc:v2:uFGvpM9Zj7SBK5iq7xaB7TYEHEc/DcsppHacDMUkqZo=:t/4n3GTqnGvghRHO:vzNvEtAEBFE1N2++CLUbrg==:8NURK3Z0tQ==	2026-07-09 13:54:08.862235	2026-07-09 13:54:10.346	941e9d22-30bd-4ce4-b843-a55370287419
8edb63ef-08ab-4972-b531-2fe83b95709a	enc:v2:H7eSUEurhr9SWGbj9z7TxYUt2zozLtV9r2M/EtQ2Zlc=:DnlnfIDLZTQGrbxN:uaQ0WxHTTqUJ4v2UrQENCQ==:/ag2IRY7sozeJdhZFRHTsnysgB8T7TI=	advisor	enc:v2:NQRbG9BCHxKCEeZLh0RKCMahObQDMeva35bD0KqxJj0=:fVCqG1M0UdTB+nqf:c5MBL693B9mGBe/BNhhqRw==:w6dtXg+dzNGEU/p8	2026-07-09 16:18:32.550354	2026-07-09 16:18:32.987	977e23f4-d1e2-4b77-94ce-e3b081c3578f
b1555a71-1d4e-42ed-adfa-af0409a5fcc0	enc:v2:i5Uvu2K7w/+9BMyih88Iu0/RQZCKKt/mAoQedYzdO2U=:Gf536AUlqeiykhAY:e3TfSB1Vj7J5Q1bZ6l/29g==:s0j0vbgDnJkhxtVUIvXguHCirGdR2Mm+c2jNABSbA8pG5C4tQ4p8	advisor	enc:v2:x98Vs91J63cZ4iZ8+wwb9tYdedTyLL5nGer7FVLH4hs=:eYjm7I1SWQZiv7Ck:WRBfL3sWAiBOf4/Cn5wRDA==:jqsbBQ7vDzM9v7w=	2026-07-09 19:01:22.15817	2026-07-09 19:01:22.673	1447f726-fd24-46a9-8cac-8ea09446603c
5d1af52b-9893-482a-a337-00d39680aef5	enc:v2:4jjo7X3kPbv7ruHsxF57Pl3YJbIKYGDBSdMpLKBi+QE=:SobBcwu0H1T3ph4V:FCjIaWxfg/3+yaLkjLYz2g==:GB8j	client	enc:v2:8j3j5p1XjewsZsWIp2tsfPHIuZpbo9NePpAtg5QeRIE=:T3ZqN2vtygCaEyx7:Z2V3ED52v8/eU1UA1LDPpg==:TEz7	2026-07-09 19:01:37.24336	2026-07-09 19:01:37.739	1447f726-fd24-46a9-8cac-8ea09446603c
b8a481e0-a3b2-4bb3-9cc1-afdf6a660e7d	enc:v2:4gpML+5pJSp2y72J0Kj5fKoL0xKSzi7YlvW4hk053yI=:bV7PW8CVm+s1TCfu:Sv/GmJ45ZH5NCvJnk5ZAfQ==:F0hg	client	enc:v2:T0YnCccT0SAiwMW3zq50ugbaIKufKVKitHpxcrt8vVY=:OG+Qgqx5l3HsUKii:uTm9eHeJdQ6D9hyn74wXrw==:sv3d	2026-07-09 19:01:38.254707	2026-07-09 19:01:38.904	1447f726-fd24-46a9-8cac-8ea09446603c
7a75008f-ba6c-4c62-974e-f7d8ae9ef4e7	enc:v2:xccO80raYw2WT4XwSLuu90Y+Qng19RRh6Nc/1Jn8RoU=:3NsP6xnl9/+gUrvM:jLGxx4g+bows81kyOKcMhg==:IiI=	advisor	enc:v2:2pvcImjrWHRkbnG3LFqVyg8yZQzRZ48CYfIR3yzRgUI=:ZEqyoVNKl+3pvRgj:qCoZ32PcXvedGNATxhwxOw==:syEz2ooDvr2XTTU=	2026-07-09 19:01:40.958489	2026-07-09 19:01:41.452	1447f726-fd24-46a9-8cac-8ea09446603c
1f8fb02c-9d40-4614-af41-5447ab964f42	enc:v2:lpjWhD83VQtTXW7gIYuJ8z3+rJqFv4P3dHsA5PRCJGY=:+yVwa5RVM3TaQudF:LNZPkkcg0PXH60ByU4Iypw==:pAY09w==	client	enc:v2:9M+RmPt/QbSFO3yVb0tMgMLMvOyALK5e8K3y+Cl9tfE=:IJWdzAqWNMdVUHli:kMt+JycEDDZc87KZvfkwyg==:gC3V	2026-07-09 19:01:43.731579	2026-07-09 19:01:44.172	1447f726-fd24-46a9-8cac-8ea09446603c
\.


--
-- Data for Name: ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ratings (id, estrellas, comentario, etiquetas, created_at, session_id) FROM stdin;
6c3adeb7-fef9-4a50-b007-2136f21594f6	5	\N	["Paciente", "Claro", "Muy útil", "Profesional"]	2026-07-08 16:56:36.05253	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d
6cd15069-b8be-44f8-9c44-2c354a031b15	1	\N	[]	2026-07-08 17:41:43.742955	50cf4950-2da3-47aa-a981-a509eb37550a
ee8c8651-3392-474e-83e6-7254687b68d0	5	\N	["Muy útil", "Claro", "Paciente"]	2026-07-08 21:06:46.778996	2bc55ab8-9e67-48bb-9aff-6f7b412deeab
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sessions (id, codigo, client_name, identificacion, apellido, rol, colegio, colegio_link, tipo_solicitud, status, created_at, closed_at, advisor_id) FROM stdin;
58e751f6-abe5-4c3a-b948-ccfa779f0bf2	RC-2026-J2HX	enc:v2:dSjIWjlBTkjQVDcaw94+Y+ym9D8VWR+8CtDX/FPUYDc=:PSjtxqPDLZuBRLDJ:yLbCyAIxBoPW2SGT7OK6FQ==:ToH0	enc:v2:Tj4KkFFj25LQYOIjxjNwbhfMAeWQLHSpJn+4uK1iXvE=:9Ug+o/6Vikd+s2c1:kl4f4F/zHYLQkVdtBmfW/A==:/gafy4CY	enc:v2:P1rjr1wqBBqomyAYMK04mh4X6vFO2c7KyuDGxyFFNw8=:tACwCRSCGRMtq/h3:VuBq55aOEFVv8UesxUTDTg==:VVRL4q0=	estudiante	Colegio General	#	info	closed	2026-07-08 16:48:28.063241	2026-07-08 16:51:36.997	\N
c1238d0a-e941-45c0-ae94-3167257fc900	RC-2026-AOP4	enc:v2:b9VFF4GBqmOgqrR3MdLlDigvRpjoFpxuQl7+cD76LLo=:TaJi6cgqPI48ae6x:yHA3oC7qR3L2tzoVgSTeJw==:P94R	enc:v2:d0V2BLH/RepdPdY+XK2yBRPYpwyZyvGQcVpNm5OVcDA=:8YVGtAgPPEhgwDyS:U8gFu9Kedkr9j90VkkcGtA==:GuQRGcBJ	enc:v2:doHnFbHeB+tjJMf8kKaK/cmzixZRAwDSMluU+T14/6Q=:GtzGkuJjgPe/JnWV:MgKGFYM981AxB0ld2gjcwg==:Jr1R	estudiante	Colegio General	#	info	closed	2026-07-08 17:39:50.81511	2026-07-08 18:33:38.533	\N
ce1b7189-bd2d-4914-9860-916373d79a21	RC-2026-EOG_	enc:v2:RAvWFXLyurzQOs7j3cyM3o+H8JzLKHTBDIWMJJIbxkg=:LaRClfgwCWCnww5y:WneYnc8UOcW0QUS/kyG9uw==:Ql+M	enc:v2:De0Xuh6XBmneVUx3Ze/DLepRZbheFVXt73FpE5eE8pw=:MUInXR+vQR9AVr0D:DLW/7fd4PT7EiwvsOR0Ttg==:5Dvl	enc:v2:4MPZ/NPmOdhlcl3ZL/sYiGSTx8apiwa46uX9YIEjwNE=:WLizWayooKl+JAdd:Er2QSNfJ/IV7EYvakDxNrA==:H3Bc	docente	Colegio General	#	info	ai	2026-07-08 18:33:45.211214	\N	\N
2edbf097-bf63-4a59-91d0-b318be4005db	RC-2026-TQVI	enc:v2:ytwoxYOFXYKponlr1DjmiOgoseKl8euhgHqZPYnqCOI=:jFH3PBf3TiRFPtdO:TStaZjl/hsCe92eW/LvDMw==:aFNNk9L8wg4=	enc:v2:ZzXcB5ytFduubhqFE9Y9phiJoPfUmQEGwg6vlWO6AaY=:6F4481FtUuSSzzht:X+nIgRWUBYkRV+UpYTuZcQ==:hEOlksmd	enc:v2:Jp+gm4h4N7bBCzdfCbtil6paJmqo4AK8I5HXpMBs2t4=:bp2/xGDIClcS68pd:Rd7YMQXo/tmvSQnXm9WNqg==:5Q==	docente	Colegio General	#	soporte	closed	2026-07-08 18:34:00.614922	2026-07-08 18:35:37.391	\N
56e01976-0201-476e-9da4-b7ad450dd1fb	RC-2026-QZZG	enc:v2:FwMi/YoreZzAYqW2WDphzfvBEZ22/wku2iPf5+UA11M=:WT9PGcgsmsnKQI/Q:37hHQBQbe5ixDQ9rlmYpHg==:EKYm	enc:v2:QqrNRYPR2CNTaKitDKLO0t3nP5ZXCldYfw9ZaWX17pI=:KAO9093Z1Ok0o8Zl:sGNff+VjJh2zLgYEnOSc2w==:sbmF	enc:v2:svWSIBt7QN8EFLAB7NmGs1zoG7WaV/NAXegCHA550hM=:+wI+3uqDY3U+5XQw:E4UczhFOZBlkAoXcL7PCPw==:UHI8	docente	Colegio General	#	info	closed	2026-07-08 19:45:47.641498	2026-07-08 19:48:50.47	\N
9f9c633c-7c52-44f9-9a66-c0857946df25	RC-2026-MJF2	enc:v2:RmiXTC9wrbWaKqqvO/syrU2193NTsl7tByHaRpYOsPI=:iZ41XvFGxnGRBeBy:RfOBFk2EGjWcvD8dm/3VHA==:UjiUHOkR	enc:v2:mrmEdjiMypx5nInqJS9icAbFWY1XpAd/iUK+h5Q0h/M=:O1M3WUKuzHZkSZjM:AegZ/k/GdJ0DzC0QCPXCUA==:NFZ7Iisi9VGy54ZJzQ==	enc:v2:vw6PDSRUw0ubiTAl11BLF7lx2U5sCnofOf0hYLQ6D3U=:wg1Li40R9HMnmM3w:NmQEeqRJjjtft/plRO4X0A==:OTc++4a3N81eWA==	estudiante	Colegio General	#	info	closed	2026-07-08 19:45:37.214871	2026-07-08 19:49:12.169	\N
7fae884b-c57c-4d5e-b5fc-8aa987e5286c	RC-2026-XIBL	enc:v2:I4pjZSLO2ksMtLzIRYjAETXcelFOKOz81WEBUWB2I7s=:hf938l9X+2RFBtQK:59enQlkzFnQztarR3jnMZg==:QDdR7Q==	enc:v2:4/QT8jIL3Loo/1l5QA3YiSJy1Suvc0PTkz9NpYXAgMg=:TlQD9fpaQUM6F2nl:+dtPdVrzXturC6NfSuSg4Q==:aMfUp5r2	enc:v2:WiLBy1kBZ4wFjzaM6Gv9IRdml8Gsz2ICaYSfxWo5xjM=:21jswwjP8ZfEc99y:ei2Zx4tb0Kw5tt9sOqCTgQ==:IOoRjUM=	estudiante	Colegio General	#	info	closed	2026-07-08 16:43:38.42036	2026-07-08 16:44:03.887	\N
d662ab8b-b043-4a62-a5f8-d7bcf2cef86d	RC-2026-A8VY	enc:v2:dnaaOjWVAupeNJj17SVh+wQ/X7oVqb78mG7HHiG8kDE=:KcZGN/q3D0h0hsMA:sYkc3RoYkydBfXLOVBTjuA==:975PxVcIeg==	enc:v2:Cf+iTx984xpU6pr7gvaMED1f//4iJKPUfMtmtrodtR0=:09hh6dG0FX8bDPmo:HADhJ4tGTSpxgcfVXSgfxQ==:oC4=	enc:v2:wPpDJzGiXx/IZ10yut3U6vcA5ejgFWmjOpgLSwFnxE4=:nwOHsudklOSoKyIQ:1RV8g+YdUiUXxxDj0zLkQQ==:jfqu41k=	estudiante	Colegio General	#	soporte	closed	2026-07-08 16:50:48.491533	2026-07-08 16:56:01.064	\N
50cf4950-2da3-47aa-a981-a509eb37550a	RC-2026-GP4N	enc:v2:sSd5Zw5TsDJeNDtRFVxdAS9944SZ7rP3VfO4WlxzAIE=:Ml7TfcsOpHBIhWTV:NshgshiZ0vF1UJABxsg8ng==:5UwQC2IFMg==	enc:v2:DUIK4r5b1d1mvQfh35vpQ0s0tPlzMTDLcDui+3jtS6E=:SNxXT/JjTgImMU4G:pJqI073rQkNPNOpqocuCLQ==:G5rT+rCWo6A=	enc:v2:Yfd3cjAYod3qza7fS/Zx9JuFeYCwmWP6W1l1nkAhwHc=:6GQrJROIt8U7V08K:G2U/QrNqfZ9aOhVLSbLj9A==:dzD+6w==	estudiante	Colegio General	#	matricula	closed	2026-07-08 17:36:02.631755	2026-07-08 17:40:22.493	\N
73d46a8c-eb49-4089-84bd-e2bad2b13179	RC-2026-N0GE	enc:v2:fJqvN60bA84UtVNWqEaqzg+RxZDSMDkwdKg3vA2G4bE=:KWdypUdh1UMfFnSm:/k2gG62yUmpxkyL8DM7aVA==:iSCm	enc:v2:1ZI5g9H8bi5xCj7YXYMG80l5p09/bYmYhlOq9iOhghk=:i8u5wYMJcMuEe/Un:p/ezVYG7UDp/WjZhkuMnMw==:5CExzg9Y	enc:v2:SR+VN1svJ3vM8n28AoGnl7D4yRE5ATQnedXIgWLUKrM=:mKXcxKHmIqpRSBA+:9EQ0MMyx7YsNtv7t6hjwPg==:qogLg4s=	docente	Colegio General	#	info	closed	2026-07-08 18:34:47.206686	2026-07-08 18:50:09.475	\N
e091a288-5275-41b3-a53b-f88c3ad36863	RC-2026-O6NN	enc:v2:efNiMaNIp2S/O0t9wFhtzGEQBFU3aiPwulgr0JO+bfs=:Db0E1DN3AIjQALUP:zISIkStQrWLWcyg2SijprA==:oj7JhA07vg==	enc:v2:pGcbprklYa0yXrh2+i/rfiQJZ/NE9ha9jcIkO+hzILc=:tMw4RhKD2NYh/nRQ:cOUFO3n3aTw7yKetx8rgrw==:s19Y9OEC3g==	enc:v2:/XEJlKmUVuhpRJlhnBTkLAAkeK0vGU+6218S9gXdlJY=:0D06B1BnsTb37kF/:RBscj8SMNz+8q1kRPLzTfw==:4mm0TmAJrw==	estudiante	Colegio General	#	info	ai	2026-07-08 20:34:18.480605	\N	\N
63ac3d0a-36a8-4bb5-9665-25e1f55709b8	RC-2026-JUJM	enc:v2:DN5ib5pcb0cKILr+B3s16p1HT0/8Rm8amLlxt9QxjBg=:AhWIV8MDDRijxzS9:BeajP7tWuekO0MtugMYBMQ==:jOtriKLZ	enc:v2:N3uB8jVgH+M1zgH8DSpZ/Z3soFuioG15+09rj3ZKg5E=:gvpSMn+6W4+X32HC:A9GCgbbMUixbtMOdvrlvIA==:xJGTv0M5	enc:v2:9JzRQXq+J3mZYJI5BtwNXP7YRHqFkZ8zMXkwiKrV2hE=:NZbR6xujG+4VUA3r:6GG72ANz8Y6r5uVAgAct0Q==:5u1CK6s=	estudiante	Innovacloud	https://innovacloud.co	info	ai	2026-07-08 20:37:41.711671	\N	\N
d9343c24-8e46-423c-87dc-a849e3897c02	RC-2026-OCXJ	enc:v2:o/vHwYYBspzY7iHP+D2qX8GvCqO+b0TZgpYzSMTYLY0=:s82PLN5fbCTOXU13:51nFPHNlLVFnlBONTy8MMw==:ti1rqjI=	enc:v2:QtVKlvprlIrAEA9goG4qXvz1g2NTAvmzIvOp5JE1v50=:fd7EiFyPAeWXGBHU:3TH2XnY5cAxnsk/rIX7lKA==:WC85zXMr	enc:v2:PA03/rjevjNd8VZ1Z0zVZ2mpuEV3E3DLruOJOabfWu0=:5hdLf88gNUyaFlXa:3GLQTRThT19Knds7AWRDIg==:Ijrm1w==	estudiante	Colegio General	#	soporte	closed	2026-07-08 20:33:46.034959	2026-07-08 21:02:26.611	\N
74db089f-396b-44fb-94f4-8461b33f2389	RC-2026-RBJE	enc:v2:eKrXO0/Iixk7HwD0n9gnYPy1rZjIBSsXTtS6C2MR8rw=:3B8k56FUh1l66Qsf:uELEabdP64cqYTm0dKLUJQ==:NB/gZoX5	enc:v2:RjR5YHLxaCLJZMOKL2VM/a+if+BdQflwfK5BMfVas4c=:mfJKXQlti/YHvASF:EuWL+bfjYYMUGM4fFapysw==:qAwx6MAY	enc:v2:/e+34jBspP/bw5Mq0ck7MBcIbdtA88skQtdHMqrAwKU=:HKlxgHEi8srbzJ7Y:gsyxxp8VtHCtqjamxi1W2g==:ztDCxmMb	estudiante	Colegio General	#	info	ai	2026-07-08 21:03:55.254989	\N	\N
2bc55ab8-9e67-48bb-9aff-6f7b412deeab	RC-2026-U-FJ	enc:v2:TU33ruR1CYU9SO0LfKahLFXUoDDfLJ+AZYh/Yz0eDZM=:v2mlfBhEMPF+AZ6r:4SQj5xQX+aOWBGjlClCPqg==:f2ksEC7y	enc:v2:xmV+xiCLSM0/B/dPXnInTkJGIkK90k2jPUB6xs06qQA=:BEeHSFYGFaDi50bG:VU6UZ8KNYG1HCePNCpQnlw==:k+QSVHCV	enc:v2:Flt/FJc1ocJYHtB1/8SmYEV91BcY65Ku28uIx4X38TA=:PYpH0QZvNCNsAmEW:jLKcw83ic9gb644CWQ3qbw==:VqNat4vq	estudiante	Colegio General	#	info	closed	2026-07-08 21:03:56.467297	2026-07-08 21:06:43.446	40e18b6a-8174-4f73-9ffd-1a875357805e
03c7bafa-c805-420c-806a-6e4a9e2f36c9	RC-2026-MGWN	enc:v2:QK7sSd5MpGeQ4cehifHoEZvNCpV0DFUdGsQ3kzrPWHI=:vXFuMl4G6RnX6PqK:yMx7s3wbEbJXlnZck4iwAA==:gn78KJG1iQ==	enc:v2:IRleNaqeWGelYeLzBqdpjR4vbsLx6VxmNWHyJ4z4Ad4=:2iaXw786c61/5XIX:mG+UA3CQ1xbCSEOtobyM8A==:pbOBN5lz	enc:v2:zTA22aTpo1I/hlRIuBvC9S1tLoWPfzGfgHcZ1sd6a5M=:08kCu5uWnFNsi5q8:Xc/Dyvnyt2bSRLlr2d7+Ow==:nCkO	estudiante	Colegio General	#	info	closed	2026-07-09 13:51:00.668465	2026-07-09 13:51:56.409	9f9aed89-962d-4271-aa03-224ed1fd2e82
941e9d22-30bd-4ce4-b843-a55370287419	RC-2026-PJE6	enc:v2:2lXBd+GkbRSGwZou6OnMNQFpzzGCO0D5iixiv7ogSkg=:S4s65GeCDuLWm3cy:EmmJWmwzAvwKyPiTse67UA==:Ntjl8P33	enc:v2:lqYiDJwX4tZ0fLHLm2yRrzt/ERQVlnDkuGx6ZywyQ2I=:wZ0HLTLvjp4aSI62:Z+sL58CUnpVStBiqJG0pDA==:tS5JVC5v	enc:v2:tZgA6lpZ0Za4gEo3ekStF+Mx1Dov8kbc5QPPq/L1Ynw=:mQMT81PMsPdpjr64:QkUawnIlVESXhFPFz8Gcew==:WBNJ	docente	Colegio General	#	info	closed	2026-07-09 13:52:02.643877	2026-07-09 13:54:11.916	9f9aed89-962d-4271-aa03-224ed1fd2e82
16008d38-1279-4b97-bca7-410382daad58	RC-2026-80KF	enc:v2:Upy+ONIqvvBZCI6TPKIN2njdrWF9vwgZsV1tmBP+KkM=:6qAzUyMZNeuFKHSO:O5Z5Jsd1IwLA/uV/8XlH1w==:pfOQAz45	enc:v2:VF7DTC+S1h6y9gFIy6WB3Z3o5q5JUOH/7zOMxou5jVM=:4hs1lNgymW5y7rqJ:GNe8yT70v272nwCtf3llkg==:Ux7VTTtReA==	enc:v2:Hq1rVyDTU7ns6krsMQBgBEmAwe+iqwcvywfQxhi55oY=:JvDV0DMVXmtFcZHq:ialnpvluXtjI83EV0CRsKg==:jMis6Q==	estudiante	Colegio General	#	info	closed	2026-07-09 13:57:45.832874	2026-07-09 14:00:00.339	57fc4406-fc9a-456c-afa5-4c1936b55cff
977e23f4-d1e2-4b77-94ce-e3b081c3578f	RC-2026-Z2DH	enc:v2:poJBVUNpU96n5zytMKBvoI8AJ+EjTBZYFAr0z295frc=:RGoI2sioxGndRzms:6Yb2cQ/lQZlISZV5bme6FA==:8pcCvCXD	enc:v2:3dD60y9ieItsoNLa085jRhqL5Opx0dw42uto3IfcNoQ=:bMG9KzCW5c/XS5hv:c2AzB8FYgnW/PZkWlky3lg==:4AfjatsE	enc:v2:A1msbNzcVeVUL9pDvfwWad1bTQrGlG+41mUddRSu3JQ=:OeDCDzm+eMxQvZ92:WMgOrSbrcCRx0FZpH3O0cA==:KcRp1zs=	estudiante	Colegio General	#	info	closed	2026-07-09 16:18:10.089284	2026-07-09 16:28:31.22	57fc4406-fc9a-456c-afa5-4c1936b55cff
1447f726-fd24-46a9-8cac-8ea09446603c	RC-2026-PJJQ	enc:v2:Dv2ylYFc83YvdfvoPpd/FpLpKirQhae3IbhISqRV/sU=:cdTHUH4u30K8J8zn:5mqakYXxU9jaKoCiB15niw==:tRRU	enc:v2:5/+iJSdFPtFMsjVnQUQGL4h9xu4DgcjA2XIteCEgG58=:5NT4amPph2OAiqP1:ravUsx2M9njxJ1VIRzgLrw==:+SW58s8=	enc:v2:uyIJHqTF3djs/0xK2Vhnnm7UzHJU/YUblwARFUGpRDo=:WaAgvGqToMnBZBLE:GcC378qtdBTzmGRrKVL0sg==:oyDyenAz	docente	Colegio General	#	info	active	2026-07-09 19:01:02.051351	\N	9f9aed89-962d-4271-aa03-224ed1fd2e82
\.


--
-- Data for Name: teams_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.teams_tokens (id, advisor_id, access_token, refresh_token, expires_at, account_name, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: tickets; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tickets (id, codigo, titulo, descripcion, status, priority, category, source_type, source_id, conversation, assigned_to_name, client_name, "clientInfo", created_at, updated_at, closed_at, assigned_to_id, created_by_id, closed_by_id) FROM stdin;
ffc7a192-0fce-4c80-a90a-92522ccbddf5	TKT-2026-0002	Ticket desde WhatsApp - asd	\N	in_progress	high	Administrativo	whatsapp	ffc3caf4-7a39-4d64-b633-45341a266751	[{"name": "CLOUD TECHNOLOGYS CENTER", "role": "client", "type": "text", "content": "hola", "mediaUrl": null, "timestamp": "2026-07-08T19:03:57.807Z"}, {"name": "Andres Sapta", "role": "advisor", "type": "text", "content": "Hola, soy Andres Sapta. Ya fui asignado a tu conversacion y revisare tu caso.", "mediaUrl": null, "timestamp": "2026-07-08T19:03:58.631Z"}, {"name": "WhatsApp", "role": "advisor", "type": "text", "content": "Te encuentras en cola. En breves momentos un asesor se comunicara contigo.", "mediaUrl": null, "timestamp": "2026-07-08T19:04:00.053Z"}, {"name": "CLOUD TECHNOLOGYS CENTER", "role": "client", "type": "text", "content": "hola", "mediaUrl": null, "timestamp": "2026-07-08T19:04:19.779Z"}, {"name": "CLOUD TECHNOLOGYS CENTER", "role": "client", "type": "text", "content": "como estaS?", "mediaUrl": null, "timestamp": "2026-07-08T19:04:41.010Z"}, {"name": "Andres Sapta", "role": "advisor", "type": "text", "content": "bien y tu?", "mediaUrl": null, "timestamp": "2026-07-08T19:04:47.086Z"}, {"name": "Andres Sapta", "role": "advisor", "type": "text", "content": "Hola, con gusto reviso tu caso.", "mediaUrl": null, "timestamp": "2026-07-08T19:05:02.229Z"}, {"name": "WhatsApp", "role": "advisor", "type": "text", "content": "Hola, soy qweqwe. Ya fui asignado a tu conversacion y revisare tu caso.", "mediaUrl": null, "timestamp": "2026-07-08T19:05:55.897Z"}, {"name": "CLOUD TECHNOLOGYS CENTER", "role": "client", "type": "text", "content": "gola", "mediaUrl": null, "timestamp": "2026-07-08T19:09:38.801Z"}, {"name": "WhatsApp", "role": "advisor", "type": "text", "content": "hgj", "mediaUrl": null, "timestamp": "2026-07-08T19:33:46.686Z"}, {"name": "WhatsApp", "role": "advisor", "type": "text", "content": "asds", "mediaUrl": null, "timestamp": "2026-07-08T19:33:58.170Z"}, {"name": "WhatsApp", "role": "advisor", "type": "text", "content": "asd", "mediaUrl": null, "timestamp": "2026-07-08T19:34:01.389Z"}, {"name": "WhatsApp", "role": "advisor", "type": "reaction", "content": "✅", "mediaUrl": null, "timestamp": "2026-07-08T19:35:47.424Z"}, {"name": "CLOUD TECHNOLOGYS CENTER", "role": "client", "type": "text", "content": "Hola", "mediaUrl": null, "timestamp": "2026-07-08T20:04:54.096Z"}, {"name": "Eduardo Barros", "role": "advisor", "type": "text", "content": "Hola, soy Eduardo Barros. Ya fui asignado a tu conversacion y revisare tu caso.", "mediaUrl": null, "timestamp": "2026-07-08T20:41:59.492Z"}, {"name": "Eduardo Barros", "role": "advisor", "type": "text", "content": "Hola, soy Eduardo Barros. Ya fui asignado a tu conversacion y revisare tu caso.", "mediaUrl": null, "timestamp": "2026-07-08T20:42:11.140Z"}, {"name": "Eduardo Barros", "role": "advisor", "type": "text", "content": "Hola, soy Eduardo Barros. Ya fui asignado a tu conversacion y revisare tu caso.", "mediaUrl": null, "timestamp": "2026-07-08T20:42:11.793Z"}, {"name": "Eduardo Barros", "role": "advisor", "type": "text", "content": "jkjkjkjkjjlojkkj", "mediaUrl": null, "timestamp": "2026-07-08T20:42:33.653Z"}]	Eduardo Barros	asd	{"city": "", "role": "Cliente WhatsApp", "phone": "215873730129958@lid", "institution": "WhatsApp"}	2026-07-08 20:43:10.285399	2026-07-08 21:27:20.528963	\N	924dc8c5-848c-4e77-8b21-84a034bcafc7	924dc8c5-848c-4e77-8b21-84a034bcafc7	\N
dff74fd2-1fed-478a-80ce-a4f29e182a79	TKT-2026-0001	Ticket desde sesion RC-2026-A8VY	sadasd	closed	medium	Soporte tecnico	web	d662ab8b-b043-4a62-a5f8-d7bcf2cef86d	[{"name": "Andres Sapta", "role": "advisor", "content": "¡Bienvenido! ¿En qué puedo ayudarte?", "timestamp": "2026-07-08T16:51:29.139Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "Hola care picha", "timestamp": "2026-07-08T16:51:38.287Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "estas bien?", "timestamp": "2026-07-08T16:51:42.864Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "looool", "timestamp": "2026-07-08T16:51:44.750Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "loloasd", "timestamp": "2026-07-08T16:51:45.519Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "asd", "timestamp": "2026-07-08T16:51:45.703Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "sd", "timestamp": "2026-07-08T16:51:45.783Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "s", "timestamp": "2026-07-08T16:51:45.909Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "da", "timestamp": "2026-07-08T16:51:46.103Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "dasdsa", "timestamp": "2026-07-08T16:51:46.197Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "da", "timestamp": "2026-07-08T16:51:46.343Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "dasd", "timestamp": "2026-07-08T16:51:46.480Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "asd", "timestamp": "2026-07-08T16:51:46.614Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "asd", "timestamp": "2026-07-08T16:51:46.750Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "sa", "timestamp": "2026-07-08T16:51:46.869Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "das", "timestamp": "2026-07-08T16:51:46.999Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "d", "timestamp": "2026-07-08T16:51:47.178Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "asd", "timestamp": "2026-07-08T16:51:47.262Z"}, {"name": "Andres Sapta", "role": "advisor", "content": "asd", "timestamp": "2026-07-08T16:51:47.388Z"}]	Andres Sapta	juanito jkkjk	{"rol": "estudiante", "colegio": "Colegio General", "tipoSolicitud": "soporte", "identificacion": "11"}	2026-07-08 16:51:57.348156	2026-07-08 21:27:38.42728	2026-07-08 21:27:38.425	\N	\N	4c436cd8-43e7-4bf9-8fc3-80778e6c4c7a
690a8b2b-5d36-4e1a-8e7a-f4ad6c73b113	TKT-2026-0003	Ticket desde WhatsApp - Agente de Soporte Alvaro Yepes	\N	in_progress	medium	Academico	whatsapp	e564ef65-79f5-46d2-8437-6097f73c5bc4	[{"name": "Agente de Soporte Alvaro Yepes", "role": "client", "type": "text", "content": "Hola", "mediaUrl": null, "timestamp": "2026-07-08T19:53:37.071Z"}, {"name": "qweqwe", "role": "advisor", "type": "text", "content": "Hola, soy qweqwe. Ya fui asignado a tu conversacion y revisare tu caso.", "mediaUrl": null, "timestamp": "2026-07-08T19:53:37.767Z"}, {"name": "WhatsApp", "role": "advisor", "type": "text", "content": "Te encuentras en cola. En breves momentos un asesor se comunicara contigo.", "mediaUrl": null, "timestamp": "2026-07-08T19:53:37.873Z"}, {"name": "qweqwe", "role": "advisor", "type": "text", "content": "Hola, con gusto reviso tu caso.", "mediaUrl": null, "timestamp": "2026-07-08T19:53:57.730Z"}, {"name": "Agente de Soporte Alvaro Yepes", "role": "client", "type": "text", "content": "holaaaaa", "mediaUrl": null, "timestamp": "2026-07-08T20:10:42.014Z"}, {"name": "Alvaro Yepes", "role": "advisor", "type": "text", "content": "Hola, soy Alvaro Yepes. Ya fui asignado a tu conversacion y revisare tu caso.", "mediaUrl": null, "timestamp": "2026-07-08T20:10:42.322Z"}, {"name": "Alvaro Yepes", "role": "advisor", "type": "text", "content": "hola MR. buen dia", "mediaUrl": null, "timestamp": "2026-07-08T20:11:06.812Z"}, {"name": "Alvaro Yepes", "role": "advisor", "type": "text", "content": "me Indica que le puedo apoyar", "mediaUrl": null, "timestamp": "2026-07-08T20:11:17.325Z"}, {"name": "Alvaro Yepes", "role": "advisor", "type": "reaction", "content": "👍", "mediaUrl": null, "timestamp": "2026-07-08T20:14:44.419Z"}, {"name": "Agente de Soporte Alvaro Yepes", "role": "client", "type": "text", "content": "212", "mediaUrl": null, "timestamp": "2026-07-08T20:15:54.747Z"}, {"name": "Agente de Soporte Alvaro Yepes", "role": "client", "type": "text", "content": "254112", "mediaUrl": null, "timestamp": "2026-07-08T20:15:59.902Z"}, {"name": "Agente de Soporte Alvaro Yepes", "role": "client", "type": "text", "content": "2", "mediaUrl": null, "timestamp": "2026-07-08T20:16:14.393Z"}, {"name": "Agente de Soporte Alvaro Yepes", "role": "client", "type": "text", "content": "222662", "mediaUrl": null, "timestamp": "2026-07-08T20:16:17.652Z"}, {"name": "Agente de Soporte Alvaro Yepes", "role": "client", "type": "text", "content": "322", "mediaUrl": null, "timestamp": "2026-07-08T20:16:25.924Z"}, {"name": "ASESOR", "role": "advisor", "type": "text", "content": "Hola, soy qweqwe. Ya fui asignado a tu conversacion y revisare tu caso.", "mediaUrl": null, "timestamp": "2026-07-08T20:17:34.076Z"}, {"name": "Alvaro Yepes", "role": "advisor", "type": "text", "content": "Hola, soy Alvaro Yepes. Ya fui asignado a tu conversacion y revisare tu caso.", "mediaUrl": null, "timestamp": "2026-07-08T20:41:29.088Z"}, {"name": "Karen Torres", "role": "advisor", "type": "text", "content": "Hola, soy Karen Torres. Ya fui asignado a tu conversacion y revisare tu caso.", "mediaUrl": null, "timestamp": "2026-07-08T20:43:14.044Z"}, {"name": "Karen Torres", "role": "advisor", "type": "text", "content": "Hola, soy Karen Torres. Ya fui asignado a tu conversacion y revisare tu caso.", "mediaUrl": null, "timestamp": "2026-07-08T20:43:16.446Z"}, {"name": "Karen Torres", "role": "advisor", "type": "text", "content": "Hola, soy Karen Torres. Ya fui asignado a tu conversacion y revisare tu caso.", "mediaUrl": null, "timestamp": "2026-07-08T20:43:23.526Z"}, {"name": "Agente de Soporte Alvaro Yepes", "role": "client", "type": "text", "content": "bueno", "mediaUrl": null, "timestamp": "2026-07-08T20:46:38.715Z"}, {"name": "Agente de Soporte Alvaro Yepes", "role": "client", "type": "text", "content": "nenan ponte pilas", "mediaUrl": null, "timestamp": "2026-07-08T20:46:45.405Z"}, {"name": "Agente de Soporte Alvaro Yepes", "role": "client", "type": "text", "content": "que necesito respuestas", "mediaUrl": null, "timestamp": "2026-07-08T20:46:46.701Z"}, {"name": "Agente de Soporte Alvaro Yepes", "role": "client", "type": "text", "content": "y demoras mucho", "mediaUrl": null, "timestamp": "2026-07-08T20:46:49.703Z"}, {"name": "Agente de Soporte Alvaro Yepes", "role": "client", "type": "text", "content": "por favor", "mediaUrl": null, "timestamp": "2026-07-08T20:46:53.199Z"}, {"name": "Karen Torres", "role": "advisor", "type": "text", "content": "Dame un momento mientras valido la informacion.", "mediaUrl": null, "timestamp": "2026-07-08T20:56:00.927Z"}]	Karen Torres	Agente de Soporte Alvaro Yepes	{"city": "", "role": "Cliente WhatsApp", "phone": "40712263479465@lid", "institution": "LICEO DE CERVANTES"}	2026-07-08 20:56:51.85073	2026-07-08 21:27:17.448942	\N	e895dfff-dd65-4a60-ac07-76e7d01d023b	e895dfff-dd65-4a60-ac07-76e7d01d023b	\N
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, name, email, password_hash, role, active, created_at, status, active_chats, refresh_token, profile_photo_url) FROM stdin;
d5ab6bec-5cb8-473b-a46e-de9a62ed39ad	Joel Carmona	joel.carmona@innovacloud.co	$2b$10$hWiGk2NYwMS6wscimH.QpeSV38z0LFQBHW7X8l84VZ7SVHYdqVNX6	advisor	f	2026-07-08 20:21:40.77225	online	0	\N	\N
acbc7033-8fa2-40ad-a325-a3c9cb246846	Carlos Agamez	carlos.agamez@innovacloud.co	$2b$10$QBsHrNxiMw9jjuAPhXMbLe72wHH2Yssu6ao3OYzmW.H6f7sUGnfpO	advisor	t	2026-07-08 20:03:25.765411	offline	0	$2b$08$ONd1tFduEbWRmY5mfXSRGuvSaTFKP4GYaA/nFSI9OyTC4WIlJYoq2	\N
40e18b6a-8174-4f73-9ffd-1a875357805e	Jorge Arroyo	jorge.arroyo@innovacloud.co	$2b$10$OjlBxdHZbzQuIDHBkhPNGu.E5wDqIlL8lJH98t9Y2tTGxJ/WvvGDO	advisor	t	2026-07-08 20:23:26.36986	offline	0	$2b$08$k/GSW9k3mOhqhWYrPD4NZ.IYmmEEyGmwSwGsT2/JfMS/rhSHqlDOW	\N
57fc4406-fc9a-456c-afa5-4c1936b55cff	Alvaro Yepes	alvaro.yepes@innovacloud.co	$2b$10$rnd5XxCey1xZYxv5kHuHVec4PEvZLk25xKZUJEYBSHfKOt8BXX.jO	advisor	t	2026-07-08 18:31:03.704197	offline	0	$2b$08$qcdANmXg6vD1pXdikuFVuuY/qfLovKX8E/WZ894AU/WT2s/xYCTHm	https://innoovacloud.com/uploads/profiles/profile-57fc4406-fc9a-456c-afa5-4c1936b55cff-1783605378551.jpeg
e895dfff-dd65-4a60-ac07-76e7d01d023b	Karen Torres	karen.torres@innovacloud.co	$2b$10$kELbzP/fOHJrDKT.wm/Jg.tAdGzoUX/qVco9Q.zJagrGQmxTPEuy2	advisor	t	2026-07-08 20:24:13.947035	offline	0	$2b$08$RuKPv3.iyyYQ9bE3jOXjquWdJIYeAQlsK5FyAiD.bLKhAehZIbkuy	\N
9f9aed89-962d-4271-aa03-224ed1fd2e82	Jean Muñoz	jean.munoz@innovacloud.co	$2b$10$x6jJKCoVf.xyJVBHAKt.ouMAhI9HyiP4eq0n8F2e3IrX9SX4p//4G	advisor	t	2026-07-08 20:27:29.453963	online	1	$2b$08$3Qy3PseWx4XCUoqtDXm5ZONYuwHyDwj8KQ/EPKOSCaOHlcrlxI6.W	https://innoovacloud.com/uploads/profiles/profile-9f9aed89-962d-4271-aa03-224ed1fd2e82-1783605250362.png
30c3e2e6-f18a-48f7-88f0-e747eba551b2	Raquel Restrepo	raquel.restrepo@innovacloud.co	$2b$10$3om48QTmGe.uHGjgYnrSd.zse3eyZ6.araybZ2Dj51VsIfzweqKVO	advisor	t	2026-07-08 20:25:16.375123	online	0	$2b$08$u2UP83vOC/k0kT0qZYYlh.iCv1qcC8H/WdOBk6s4ErBxLqvmSe7Em	\N
4c436cd8-43e7-4bf9-8fc3-80778e6c4c7a	Administrador	admin@innovacloud.co	$2b$10$BTSbtY/hSwJxi.fdkU0lb.JG8Niix1twLRcVw9tG9SbedESf.hlXG	admin	t	2026-07-08 16:36:43.270363	offline	0	$2b$08$AOL86WRaysM2RKc9xZXS9edq789b1hfs2kOodDcRvveYCLPxss6eC	\N
15c26751-207f-4e91-95ad-6d53b7029bf0	Orlando Quintero	orlando.quintero@innovacloud.co	$2b$10$pM22lvK1MR1YhE.CiUWs1.AeKKMIU/aELnkumJicpCMgcp.1bbIKy	advisor	f	2026-07-08 20:28:31.275141	online	0	\N	\N
4aa0daad-ac82-468b-9599-6efad3d003c1	Sollangie Cabrera	michell.cabrera@innovacloud.co	$2b$10$1.mIt2cYXn.W7x8.aQWVFOru2QXAn0UkX/nP94snfeIGT4iXnX1FC	advisor	f	2026-07-08 20:26:19.614414	online	0	\N	\N
924dc8c5-848c-4e77-8b21-84a034bcafc7	Eduardo Barros	eduardo.barros@innovacloud.co	$2b$10$yL2e3Mz4lnwQ826WRbbSqullXPQrNtDezjiuZjBHV3ZXuFjz55Nsm	advisor	t	2026-07-08 20:19:52.967872	online	0	$2b$08$6.tINWZ0e1pBnXQGmXvjLeN5YEXt4sLk5lgbm2PkxVdUk3JqSCNFG	\N
\.


--
-- Data for Name: whatsapp_chats; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.whatsapp_chats (id, phone, jid, is_group, name, profile_picture_url, role, institution, institution_url, city, email, plan, modules, status, operational_status, operational_status_updated_at, unread_count, notes, tags, last_message_at, last_client_message_at, assigned_at, assignment_mode, queue_notice_sent, out_of_hours_notice_sent, created_at, updated_at, assigned_advisor_id, fixed_advisor_id) FROM stdin;
ffc3caf4-7a39-4d64-b633-45341a266751	215873730129958@lid	215873730129958@lid	f	asd	\N	Cliente WhatsApp	WhatsApp	https://we/		\N	WhatsApp	["Atencion"]	closed	closed	2026-07-08 20:42:54.634	0	[]	[]	2026-07-08 20:43:11.094	2026-07-08 20:04:53	\N	\N	f	f	2026-07-08 19:03:57.796932	2026-07-08 20:43:14.080648	\N	924dc8c5-848c-4e77-8b21-84a034bcafc7
e564ef65-79f5-46d2-8437-6097f73c5bc4	40712263479465@lid	40712263479465@lid	f	Agente de Soporte Alvaro Yepes	\N	Cliente WhatsApp	LICEO DE CERVANTES	https://app4.controlacademic.co/liceodecervantes		\N	PLUS++	["Atencion"]	active	in_progress	\N	0	[]	[]	2026-07-08 21:07:52.432	2026-07-08 21:07:24	2026-07-08 21:07:24.103	admin	f	f	2026-07-08 19:53:37.067835	2026-07-08 21:07:52.435085	9f9aed89-962d-4271-aa03-224ed1fd2e82	e895dfff-dd65-4a60-ac07-76e7d01d023b
d5f224f3-9802-42d9-93cf-d7e78d23d117	33247912284290@lid	33247912284290@lid	f	Agente de Soporte Jorge arroyo	\N	Cliente WhatsApp	WhatsApp	\N		\N	WhatsApp	["Atencion"]	active	in_progress	\N	0	[]	[]	2026-07-08 21:13:29.636	2026-07-08 21:08:38	2026-07-08 21:12:57.41	admin	f	f	2026-07-08 20:05:48.549402	2026-07-08 21:12:57.526	9f9aed89-962d-4271-aa03-224ed1fd2e82	\N
b3a52369-866b-49b3-8b77-f44dfd51ef4f	573105205946-1612188845@g.us	573105205946-1612188845@g.us	t	Grupo de Soporte	https://pps.whatsapp.net/v/t61.24694-24/521198155_1300821698254976_1131856764390309570_n.jpg?ccb=11-4&oh=01_Q5Aa5AFQLR9hYsL3QfL7O2gdiCS2HRwISmFPxQVlYJsrbosGKw&oe=6A5BB5CA&_nc_sid=5e03e0&_nc_cat=104	Grupo WhatsApp	Grupo	\N		\N	WhatsApp	["Atencion"]	active	in_progress	\N	0	[]	[]	2026-07-09 15:23:06.974	2026-07-09 15:23:06	\N	\N	f	f	2026-07-08 20:20:19.355095	2026-07-09 15:48:15.885284	\N	\N
1bea9e01-e99a-49cc-a794-2b54b9313c8c	204011668025465@lid	204011668025465@lid	f	Jean Munoz	\N	Cliente WhatsApp	WhatsApp	\N		\N	WhatsApp	["Atencion"]	active	in_progress	\N	0	[]	[]	2026-07-09 14:26:28.092	2026-07-09 14:26:27	2026-07-09 14:25:08.077	admin	f	f	2026-07-09 01:35:10.242959	2026-07-09 14:26:28.93006	acbc7033-8fa2-40ad-a325-a3c9cb246846	acbc7033-8fa2-40ad-a325-a3c9cb246846
\.


--
-- Data for Name: whatsapp_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.whatsapp_messages (id, meta_message_id, body, from_me, sender_name, participant_jid, status, is_auto, type, media_id, media_url, mime_type, file_name, file_size, edited_at, created_at, chat_id, advisor_id) FROM stdin;
846f7345-4555-4a02-8c35-cb063e03790a	3EB0935E8EF5FCB836AFB6	enc:v2:SVhAgV4FwBDoxpqUCeiVrPcvADDBzNawqfM+Apjsyfo=:2N7czSARM4Ibhd4Q:uLOafjhCk6MynoOAc6BTFA==:0mm8GA==	f	Agente de Soporte Alvaro Yepes	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:53:37.071333	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
8ad25666-af6b-4440-9f0d-72cc2b90f5a0	3EB0A71571FD2337DE00BE	enc:v2:qtMX23H4WrLPH3Un0ReJzNhPK0F8PxyVsKr9Yqz+xUU=:9SGrpNTQ27TBAEWY:ewdkrrWPQRq4oRQ411hVNw==:o250lPi9U2OGdyTf/Gd1sy6uXfDjLeDbL74Tc7xtzgBCvl5NNJdJS8q9vcQC9zV3qZDtM5cWMEY7u9kz8NbcVHlgS8E0PYo=	t	WhatsApp	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:05:55.89715	ffc3caf4-7a39-4d64-b633-45341a266751	\N
17c707fe-0835-40a2-9f8a-a7b06dc992b5	3EB0CC6CD9278FC27B4AB3	enc:v2:5kkGP1q2lpRX3zw4ARM4BS2UsEofqh9u4TFMVoUY80Y=:kpiNRHDPzfXoyg2L:tIZp5t1YGTMENZk+wvleSA==:PnmaypQT/bs1YFb+ui5kXF35p7u/+06a7AIp+LHgzLc27EaO0hFQHyvb/7tNG0qB8eixMFzFO0pSzZFsmmoECkLvb1CKAhBKqQOSGiwd	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:05:49.225529	d5f224f3-9802-42d9-93cf-d7e78d23d117	acbc7033-8fa2-40ad-a325-a3c9cb246846
33535b76-aa1f-45d5-96a0-857acecffbd1	3EB0DEBD90CE85FF1B6D31	enc:v2:7OMiF4FynfLukioev2TEB1B4oVAxflKNJhqvSuEPkkc=:48HrGwQQQc3/Iwdk:3xlhTFEBTCkQ4efIt7ipKQ==:4f/z6w==	f	CLOUD TECHNOLOGYS CENTER	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:03:57.807059	ffc3caf4-7a39-4d64-b633-45341a266751	\N
2a29fe17-3214-4ee6-80b5-bb0695e74cc7	3EB05BD6F6395414E39086	enc:v2:Td/hyD21QIwPk6uG0yLzAMiiB9eLQuBB2wsL8XdyzgI=:Vp67MmRayhsWvc/k:5s/Lc2tso+M5i2jVOp6LsQ==:oGAOew==	f	CLOUD TECHNOLOGYS CENTER	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:09:38.801298	ffc3caf4-7a39-4d64-b633-45341a266751	\N
12d5c216-03d2-4775-9136-f5c6e81d7f2c	3EB0C4BDDA76EFD5C3B6B2	enc:v2:5C5Hfz4C5EcORp8cDxL+5nYDxjHUPopY2v0o/Is+ubo=:kr0nQ6Iho7r4+yxw:l8claFR/Lss6Jr5XcWhAIw==:KekTI0cQ8ngqAWAVv0vUTqX/I/diBm0lXhTR1q0GBBislmu+EJmcSdB2bLMwP9lA+Rkhp6a66ig4RwuhybeCdd96WkLeFVxFcgY=	t	WhatsApp	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:04:00.0535	ffc3caf4-7a39-4d64-b633-45341a266751	\N
230be1d2-16c6-43ae-b1bf-50e1a6c90058	3EB0DD515D39F765ACA23A	enc:v2:74uJmfXtJjHAfOofZ4BALWSCXrbHPLKsYjcLXUusVlA=:lf4VkwTXw6REi4lr:P7sf9QyU0giwd1R/D06xWg==:reIW/w==	f	CLOUD TECHNOLOGYS CENTER	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:04:19.779511	ffc3caf4-7a39-4d64-b633-45341a266751	\N
581b2a6b-2c0f-433c-84c4-7f6692ef7273	3EB034BD522F1E547D5A88	enc:v2:fleuskh2msoN+xMS+r3NHvv+mKMlBoWteQPHEFCA9uU=:frXqs1niKSFrKceH:zlMNW8GIfNjWLv4Kl0rLcw==:8a6qUvT7OqlTyeg=	f	CLOUD TECHNOLOGYS CENTER	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:04:41.010657	ffc3caf4-7a39-4d64-b633-45341a266751	\N
6a14688d-9afb-425c-adab-1f7dbde4cfe1	3EB06BDD86E75A93A5BDFD	enc:v2:BAKGqlNPqoORiyHiUsDYWmUOcg1IQ31SIRipjrSbkGk=:zQggOlzqrSCnqmC4:awJ6hFSt47oE0XM8ExYCPw==:yzlVISMpHMRtBRstiA==	f	Agente de Soporte Jorge arroyo	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:05:48.554081	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
4536e5dc-06e8-4e7f-9681-e62d423c7255	3EB0B02337C07816E59525	enc:v2:X27+3h6P7kSxwlpb6WzQHSpVWUAjKXRLKgzc8dBLCVk=:UuPgd7lMoI0HSfJD:IwwbKTzo2eAqbxZ4Mx4Zfg==:/Xv9Cmyovm77uVQKStatfW75QP4FXAUFzOvDMiUadhMSXO7p7E/N8HOl91QSAkFb8XcKItYyqTaJbchC/CQKYW7fJamTlHUo8Mg=	t	ASESOR	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:05:50.455832	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
bdd6efed-c068-4571-b1c8-c39238fdb83e	3EB0813C7558DC6BAA2409	enc:v2:D8vk8cDFs6Cj2B5sHCpNykCk5suEVqwjBTnuab69D58=:PYVvp57OTNkY4+i5:0Gr4zTmXNGadlMrame/oHw==:36PC	t	WhatsApp	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:33:46.686404	ffc3caf4-7a39-4d64-b633-45341a266751	\N
cf75fa0f-2bd5-4782-bcd6-e5b7506a1966	3EB0827EC86483509383BA	enc:v2:0QEPcvVvCl3KAfAdoibQH/GUPB6nmYYDZa1dvqu6Keg=:GEbXVf7srmyf2GmV:HUcaOd+/cTiutyy/09gnoA==:3lGZ0Q==	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:05:56.446304	d5f224f3-9802-42d9-93cf-d7e78d23d117	acbc7033-8fa2-40ad-a325-a3c9cb246846
f9fc9665-2d96-4262-af93-b4814aa20ab5	3EB03B4121F2A19460A23B	enc:v2:J8JpPxDkMQ3MtEUPzklxkN53p7sk863/2wVM0YrvZOM=:4HpH1tjc6Ruz6vmU:Rjoanz54mdMyA4dMvJd2Jw==:p/MQVXdcIX39Iza6	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:06:04.55974	d5f224f3-9802-42d9-93cf-d7e78d23d117	acbc7033-8fa2-40ad-a325-a3c9cb246846
4b49f115-23cd-4334-b629-71dd59cb9da9	3EB0AA8F0C5EE944A74D7E	enc:v2:VscasGNQsRf5NbrI+eT7sZhLKw9sz4tfzZELNn48Ibo=:L2vkGbryM4Xlwo2w:gcOPtjbKq00umrFzSOMI9A==:yojjeA==	t	WhatsApp	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:33:58.170678	ffc3caf4-7a39-4d64-b633-45341a266751	\N
da777880-fcf4-4677-87b8-e5cd514c64a4	3EB0DBDFBCBFE4751D29B0	enc:v2:gChrUtlSlJrop+O8fDlK1jOmnT8uPMBh5leI+ygRWj4=:bh8uCAj44Nn9hK+C:hUD52FBj2yNNaCVcbkIszQ==:n4d6JQS5vBQiZ4EZAxf+t9LvfAtZ6agDnwuLY32DVeDLpJTjwDVaIHi7LMKeNXg=	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:06:11.310653	d5f224f3-9802-42d9-93cf-d7e78d23d117	acbc7033-8fa2-40ad-a325-a3c9cb246846
56947e1f-5bdb-47f2-a079-39beed213230	3EB036C760E8C9A7217A2C	enc:v2:WphPbCQW2gn7wXh5MlU9Zv8k4q7/4HePYHeV7oUPqKw=:gGR4asqvlaAb6r/5:hhoGNLphdV0+gFcXGBZeKQ==:GJFj	t	WhatsApp	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:34:01.389676	ffc3caf4-7a39-4d64-b633-45341a266751	\N
e849decf-e6f0-416f-be75-39c93fa7cd70	3EB074051E7035F7E916E1	enc:v2:Kmvnrt9U+uy9Q8LcUgtvwofQuf2e0N9MuHke7jbaZQM=:U/oHKgW3KRtdLyP7:HzhUREL1jgaf8L9+zlgOWw==:e4zA	t	WhatsApp	573005996359@s.whatsapp.net	sent	f	reaction	3EB0A71571FD2337DE00BE	\N	\N	\N	\N	\N	2026-07-08 19:35:47.424914	ffc3caf4-7a39-4d64-b633-45341a266751	\N
e4cb777a-1a05-43c1-9625-3bd36efcd9b5	3EB04B8F3A2B19EDA567BD	enc:v2:Ny2gN+45hMVxRAyFZkLmb4OSZetpN7MuYsmktBekVFQ=:FGqCpekH5YP8wHLS:FjwDegEHXEoY5qzroPwk1A==:59hnOIqail56N+CsNZYwYwDVQv6U+kjzwr9ZRWLDQw==	t	qweqwe	573005996359@s.whatsapp.net	sent	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:53:57.730335	e564ef65-79f5-46d2-8437-6097f73c5bc4	57fc4406-fc9a-456c-afa5-4c1936b55cff
886b7c1e-be79-4bcc-aa66-7d0979b9709f	3EB0D3CA8BD43D6862B979	enc:v2:l4S0UAoYSxTFXHbRCzTSrWFaWg0XwfDdagZhAWjjZBA=:q7acSjyGfOd8N718:mHar92QLZP8b273ec0sRIA==:WhLbW6d84xz85lVwXkDEi/OOn+OyZcg/1Kpgm2YjSYf5JpL7F4lPwK4wOjB8pkuNRPvmLMf0sPH61wECHPv7cdruTiCEZh4NCcY=	t	WhatsApp	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:53:37.87353	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
f7d429c8-1c24-46ec-b642-5b360c793841	3EB0F244B5F101793F6AD6	enc:v2:g0CbsVdpGRrf3rGkxFyft3FCOE4lHM5ZI8pjl47F88A=:OAGEtOF+NE4m94s1:csOGXWheZ8LAQystSvYuoQ==:Z3wP81yXqw3SB1KLowrGuDChxk84QeSKALCh4VSJ8KjRCMHqX+zRRBiM3IR6MHebJZb6K/TuTElZkOybNPNAmS+A+uixM00=	t	qweqwe	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:53:37.767448	e564ef65-79f5-46d2-8437-6097f73c5bc4	57fc4406-fc9a-456c-afa5-4c1936b55cff
a3d75855-ffbf-43b3-b281-4a8d2b4f9c63	3EB0FA1E20D408541AE538	enc:v2:bNDCZrHvoDfNhIKICkPHyMmnudlwjAzu+4BaaniFTIY=:+kgKhAKz+UhXyI3B:sDJR3yHT62mDcgOkLyQJZg==:GwDSeA==	f	CLOUD TECHNOLOGYS CENTER	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:04:54.096915	ffc3caf4-7a39-4d64-b633-45341a266751	\N
a19d5624-0f04-49a5-892f-2bd4d2569419	3EB088224651382C206A13	enc:v2:x/IQlkvBfW3A19qhhlnCH86zH0SzkqXeAsLw1g3TP9w=:ct/lAy/Iqsm72uCT:ZDMp7lk4HeTlhsSHQBRQ4g==:aGxCW5KtYFyOVI59yt0WSWkTqrFvNPRJEN7zoPqXP4E1AXY=	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:06:13.352636	d5f224f3-9802-42d9-93cf-d7e78d23d117	acbc7033-8fa2-40ad-a325-a3c9cb246846
e3a14215-5e38-4494-af44-2a757b0e9d61	3EB06B2E4B29D60229BC5E	enc:v2:X2rQbLb3ueAqDgm2rl1lc0nuUWGpbF3/lN+PC2v9iJk=:pyN+RSbImlqNfVzQ:pl9GxO7wpsZqSPk8LSEa7g==:	f	Agente de Soporte Jorge arroyo	\N	read	f	image	3EB06B2E4B29D60229BC5E	\N	image/webp	sticker.webp	\N	\N	2026-07-08 20:06:30.707646	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
c70f33c6-ec54-47ab-aa66-60c1a5238b21	3EB03025563B4493A67005	enc:v2:T8aOiLAqmjq1a36iDiHzf3qQi3mtYoKJQmI9wW6nT2Q=:da9eAD7srmKugfwC:V02JZcPKKxZvM4UFs+l5SQ==:+X9pnqzyDEDVrw==	f	Agente de Soporte Jorge arroyo	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:19:56.713995	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
fb997865-4d4a-46ec-bea0-185f039b342b	3EB0BE96BA2D9315C97BC7	enc:v2:kRCOto3ZRgieV3adr6L8tpTVyMC9NsrS1e+AWRIe7kA=:vXKbLUEiW5v4rqJk:vEAbv3E66k1yt9652H69nQ==:qY69Q+SiMSprOWMsZ+HwB+UIA6fIH7GbK3RoRimRC2RnUkTl8048F3DngRTJDHim81WD8ruL+h/UlwAJcbkkPBEREkZ+DDER3MZdOJk=	t	Alvaro Yepes	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:10:42.322893	e564ef65-79f5-46d2-8437-6097f73c5bc4	57fc4406-fc9a-456c-afa5-4c1936b55cff
dd516d35-4845-4fae-9f79-b48ef275554d	3EB0C90922A62CD5913EAF	enc:v2:GbyH/eJZQATGHbyqvXrKqXpBo20zxzvvqFc0gcli4YE=:HYIsGI0nBYwwTjcR:r2ZcIixCRwBIrLvJvl3GKQ==:	f	Agente de Soporte Jorge arroyo	\N	read	f	audio	3EB0C90922A62CD5913EAF	https://innoovacloud.com/uploads/whatsapp/1783541266702-208543682.ogg	audio/ogg; codecs=opus	audio-3EB0C90922A62CD5913EAF.ogg	965	\N	2026-07-08 20:07:46.42288	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
0a39fe63-7b08-42c2-8efe-c54fb94e18a8	3EB072FA0620A06EDCF8F5	enc:v2:/Iskmt1XdDbJb+VlEuXRD6Sgv0nqSpHH55Nz/NlVkcQ=:fIQcH7cQFNTDDmMV:cvIaDWOF8mRsSor1W0i0jA==:5pouMYGPyo2e9tZb3DPEqrAUBaABDrJNDGMrMzrSFCo4igc=	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:06:17.762348	d5f224f3-9802-42d9-93cf-d7e78d23d117	acbc7033-8fa2-40ad-a325-a3c9cb246846
a0d514c4-ab5d-48ad-b78d-cb94708dbf66	3EB06C3B6363A5DF7EE6BF	enc:v2:7cWREbFsal93IMmIvL8MvzXgXFiPqcpNZudg8SVrGak=:umBxxb5JUD8LGszH:2gLcr/DzpP1bfngfhSqsTQ==:U/aHAVAiGrCYR2jzk35lz20=	f	Agente de Soporte Jorge arroyo	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:09:10.091128	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
f7af70df-762d-4bea-801e-c5cfc98e2c17	3EB0006622DFCCD37CD5B7	enc:v2:Y5rZ2h2DTPjazOSnMbDdsVdNmr/4AXuGPqc5hc/WT+o=:1Rohi7Djj/oMWcm2:ZJPydZaZjOIV2gfGjqyBWw==:f52J2v00vNKQnTx3fERx7w==	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:06:49.941095	d5f224f3-9802-42d9-93cf-d7e78d23d117	acbc7033-8fa2-40ad-a325-a3c9cb246846
a0ae00d3-e4b8-45f6-9da2-201ae7a1766b	3EB0B6F22B6CF16BE8ABDD	enc:v2:z3b9DC2MGDmbZRx2T4+OKG67Vh0CrzM2L0WIv3iIKBE=:E3HCpdPL+IGaL8QV:hl4Gb6cpnlK9okWYJztCaQ==:slEWtV6DIj28xQCBR/7mYCA=	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:06:58.524545	d5f224f3-9802-42d9-93cf-d7e78d23d117	acbc7033-8fa2-40ad-a325-a3c9cb246846
5991669f-0581-42da-bd5d-7713f4e355af	3EB08A5B29BF387375E74C	enc:v2:viNFTyxjH/EGeA6WeoKBWw634WQt28pXW+YvCt82rEs=:A239f3d3RPJbH99x:/2uUeB78zf5RD9jc1dlgZQ==:MyrGg9RrDFoTpiOGaJ/pf3R4VnqLm94SEVYBG+iyehfUIbdDgf+Pt+2foTMxEfk=	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:08:09.761392	d5f224f3-9802-42d9-93cf-d7e78d23d117	acbc7033-8fa2-40ad-a325-a3c9cb246846
9cd48962-ddc0-4646-8cd7-258644007387	3EB0C3EA935CCEC7DFF71F	enc:v2:xTxPK5J3bmHy4Ap5ZmQlsDxb4tQVfWc5kq+xIdADTEU=:uLz8Xz8HHlDZWTjD:PnrsamaT812NC9oESOzZWg==:	f	Agente de Soporte Jorge arroyo	\N	read	f	audio	3EB0C3EA935CCEC7DFF71F	https://innoovacloud.com/uploads/whatsapp/1783541423886-234001899.ogg	audio/ogg; codecs=opus	audio-3EB0C3EA935CCEC7DFF71F.ogg	5919	\N	2026-07-08 20:10:23.579754	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
bf25fedd-e77c-47c1-a62d-f94227037c49	3EB0A805741A4FDD504216	enc:v2:ggr/T2wL/T0HrMRCPiCFiN6nC1PYHN7SNHj8Ndd/ga4=:z5LSCVkNck6yNUkA:vTiWNiV3KrNUfAY9TgD7oA==:vRWbwm98U4BLcHdhe/1nMiWnC54nJlaKjPqX/pPPf6BPiVo=	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:08:12.816134	d5f224f3-9802-42d9-93cf-d7e78d23d117	acbc7033-8fa2-40ad-a325-a3c9cb246846
562ecaff-6223-4067-9494-8f83c3eb072d	3EB025D78F42D52DFDB960	enc:v2:Qt42QfXdt1gPUa1458eXVylK7wsqnWzwf0OOV8iCB3k=:fkU5g4S6swc6TtBX:rT+thG3lWO2DTSCOzu6o+g==:HHqYqjNLTaumZN+xW6dXFkWsYekZrT5b64rC8eV2Og==	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:06:15.234881	d5f224f3-9802-42d9-93cf-d7e78d23d117	acbc7033-8fa2-40ad-a325-a3c9cb246846
692b753e-b469-4314-98bc-bf2660c63b6f	3EB08D2EF456B7A0D3722B	enc:v2:RyeNedVSOnECSUUor9mNfHOTFy1CYpbaUR1KOlMVEkI=:Iy7RFqifxkX0D3Lp:+5gUnCmLQxgriINb6oo4rg==:	f	Agente de Soporte Jorge arroyo	\N	read	f	image	3EB08D2EF456B7A0D3722B	https://innoovacloud.com/uploads/whatsapp/1783541232227-227283172.jpg	image/jpeg	image-3EB08D2EF456B7A0D3722B.jpg	23548	\N	2026-07-08 20:07:11.213275	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
e388e69a-e206-4966-a482-5c02706a4877	3EB033CEDDD34B7C0F8B9B	enc:v2:QNQ+oVuK8XAaT1ZuVnPaS6JLhkHpsNaJD50P9c9LkG4=:BvsDT3If1Fkxd8t+:wbxbv1XBgDla6A3+mNnb9g==:/454ZOhptpuQU0eVikNISQ==	f	Agente de Soporte Jorge arroyo	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:07:31.866888	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
58930c0e-8735-4393-b873-8a7981d3ac04	3EB01194DB3C3715942262	enc:v2:bmqSzkpaM4WL3G/WHvmQEpZVBeReLKWLA6BXyf8xRKs=:zRwz8QMnj/JFtADl:va5w5JOdo9ry7uvHBd5fww==:kUHUwM7Gp63ct6U=	f	Agente de Soporte Jorge arroyo	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:09:02.220206	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
1ed1acd3-5b07-4009-8330-0c17a890a86b	3EB008B7FBDCD81B197C95	enc:v2:KhxyfbM1EGNbmu/KIe6lP7yfQ417lqwcGfVrIZ2Gx1s=:yhpTPU89c5vZ4RV2:MLX/e+5qJA0z0JUL+whMuQ==:AGyIBkf+umM=	f	Agente de Soporte Jorge arroyo	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:09:03.660505	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
7d257eb1-7529-4cce-90a8-8e54618f0b21	3EB03A571A45F8F2394C30	enc:v2:InMp0LvUg1/AzCZs+9COgMlVNB4DnWpnbdK6YWBEK+M=:4hIQcZW1DQZLfeqb:qjWRFL+bosMfRRQ4amWNUA==:28TNiCLDt1w=	f	Agente de Soporte Alvaro Yepes	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:10:42.01459	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
68a1700d-d726-4cf1-9d79-2977c49d846e	3EB081A2D53E3F116254BC	enc:v2:SdC7rvaRr2T/KtrYyOPK3GUeTz44JudgHjYnQm85re0=:ZaRErKYVMJb5Jhwc:6XjAJh03AR9rcBUz3gHTvg==:2lyl8E3p	f	Agente de Soporte Alvaro Yepes	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:15:59.902986	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
2e9a6758-dc4c-4baf-b70e-9e06dcf6cf55	3EB0E31575A9180AB2D23F	enc:v2:QEsFjmAwhWJSQ7QB6oNeRpdxW5knWm/MbQOWtncU3Pg=:hVm4WriE66tRMWa4:uYtrv4Nh092K62t8gsOIZA==:Ko+XtJ78sfj4gO5KRsJTR+uBrsssMtYTyNZa52E=	t	Alvaro Yepes	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:11:17.325643	e564ef65-79f5-46d2-8437-6097f73c5bc4	57fc4406-fc9a-456c-afa5-4c1936b55cff
31d358a3-f533-44fc-8282-3e1698074a73	local-reaction:3EB03A571A45F8F2394C30:57fc4406-fc9a-456c-afa5-4c1936b55cff	enc:v2:sOx3lJad3OEojZiAKY7GoASaqJzuilgQvfS9twdGdK8=:oq/OZYq+JtV1Uksh:vutODgpMz2CKuy3D2xl4AQ==:pJggkQ==	t	Alvaro Yepes	573005996359@s.whatsapp.net	sent	f	reaction	3EB03A571A45F8F2394C30	\N	\N	\N	\N	\N	2026-07-08 20:14:44.41958	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
9895a0b4-1433-4e97-bb4a-59502b922ffe	3EB04D5C8EF828AD7C0AA5	enc:v2:ljQSVQ37JvNhnRROlUZs2LaDyzgwQMD8KqBIBwBPc4g=:zVVD6uSTChjqcqi2:PymiZk0Ku3GTbqYSqwnftg==:5HiNYXRhhisixGBvmK7XMqA=	t	Alvaro Yepes	573005996359@s.whatsapp.net	sent	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:11:06.812353	e564ef65-79f5-46d2-8437-6097f73c5bc4	57fc4406-fc9a-456c-afa5-4c1936b55cff
ef04f0ad-0180-4d0c-8818-f472995ecb2c	3EB070EE00BCDAD3EE1068	enc:v2:UpOmgopnx8j9zMh7YKDSDGBNMmBONBD6feeKwoeZyCA=:Ge4M1a+kDtsatp9f:nSQyHTMADsblqJYJTYC+dA==:taGB	f	Agente de Soporte Alvaro Yepes	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:15:54.74725	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
14fa2814-87c4-419c-8f0c-1842f8fb6558	3EB0298F9927BF91B0F0AD	enc:v2:uI92ostCo7LUbiF7GF83Vf0pd3TxDK+v5UaMS/MajnI=:GNyHS9UOUKJHuJ4h:9k13dtVxdf/iNEzUPYloyw==:Jw==	f	Agente de Soporte Alvaro Yepes	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:16:14.393142	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
92baf0b8-769b-427e-b09c-5fa9b6e272e8	3EB047DFEC22BB7923D20F	enc:v2:vDOJeqB72rgC9lEqE/0x3eyyogWiMV4L5u/Iw1k6aRY=:6v1c/r/XsgJNUlsE:2Wvoh2OdWe68MyCzZhxleQ==:JtxNkses	f	Agente de Soporte Alvaro Yepes	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:16:17.652012	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
8fee1bbe-1a0c-4c15-aa54-01692696af45	3EB0BB675691472F449569	enc:v2:bxrwOh535WJg9aewvd31MwUlaTTLkVjF6Wwew55OtAo=:LwiIlwF4VPr5s3DI:kNX9zIgNgtRIaQR041LGWg==:3agY	f	Agente de Soporte Alvaro Yepes	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:16:25.92473	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
992e4962-b5a9-4688-b5f6-2724d5e41a46	3EB004A54A53C3243B2F29	enc:v2:BSDltkTiyCQPopnwpqgv7CB22Fo2CndE93aX/vDl7+Q=:JvcqoWzYFv99rGrV:EdXaa/7gjAZgGQ8RZJOnJA==:Hx17WgYGS5GsSsvxxUJNIjlC/W3IfC813iBBMEtLxt73o2gTNXssawTYbchKskDdKoPQvCYbbgKwEAeNgK4eKU5HcbbhSDE=	t	ASESOR	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:17:34.076623	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
d40143be-b75e-4996-8915-6d8f965da384	3EB01E56CEEDF755FCC223	enc:v2:4eLDxUzb0UrxTnZ9jsvrR/SHbHG3QcpUo9p/QizmkAY=:eeAHdVs3vr1M/lgV:9s2iSCmZzXZ2KkNvJwO3OQ==:JGfl9p9cILmCJlrT7iSTO6K2676vAAtes+3Pjyxs+B2dMAvsV86WWHZSjB7GlreqORjmigt42dxyGqrbuGYSAve5WU0U/AM=	t	ASESOR	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:17:30.795755	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
0477af15-2748-42d5-a646-7bc74d66649c	3EB02B6CDBC792665B9BBB	enc:v2:stRVQXZdRci/CjDPTjlZFTjvYnMv8EJuL9Y1vxSAdwU=:H/QokrC6Hc4n70kl:kgOLFwhUuoNvMydJSKXayw==:XkJHIv+4S3/TkVAaH6zMdR8hnpcQdHYkplY9EDGu9ATRMPL1gaB5wk+1Btbp9x++Q+hOwe4YU83b3KA7r38ZrmBUfo8DOY4zmKwad24=	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:03:58.631432	ffc3caf4-7a39-4d64-b633-45341a266751	\N
5b7b1656-c954-455a-b9d2-d4cc16d6e194	3EB0E62F989F2FB48674B8	enc:v2:9t0jo3oi6k9dJhiJjKg0kYDwo6RMyN8KCsy+Mqps9nk=:wlEn7u3I+ztViJ/n:s0F7u3/90tFJiES5Y2AIFQ==:TbRmPhinaourqA==	t	Andres Sapta	573005996359@s.whatsapp.net	sent	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:04:47.086463	ffc3caf4-7a39-4d64-b633-45341a266751	\N
33cbe321-9627-4df0-b34b-a2e63e87c309	3EB044EDDA8FF4CBE4AC34	enc:v2:SBPgfVqdAt6MMze5h0SY6wsJ7yPtTrx3jEReM3SowcQ=:4SWmuYF72qCcyvlQ:MxQrSfNtSazzAydWl0+9MQ==:0NyKuNv77V5SzzyCeBXaOYUJqz+IU3EaBRjXVzgnGw==	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 19:05:02.229556	ffc3caf4-7a39-4d64-b633-45341a266751	\N
079fe9ab-cddf-408f-ae9c-e88df7fd1253	3EB0638C58108E451A7BCE	enc:v2:e6IxNLLWC4zBrzrMEu2+HECOcqc8YS0lXSBLrRsf6u4=:tH7baBZmwauDUET9:BM23tMniXygQAsE33GiuFQ==:681QPTb8flM83hX17g==	f	Agente de Soporte Alvaro Yepes	40712263479465@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:20:19.359639	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
40e87f38-f359-414f-bbdb-a62fbfae83a7	3EB03556F89DE7D7B2ED04	enc:v2:/gJCWT7QmIVjrO/+OF7inR6jFTKUigNjjH6WHOC7Bsg=:6nxqV1fsSbR37tgT:Ly6x0eXCI4rV3L3Vd2qG+w==:M+Sz+PA=	t	Eduardo Barros	573005996359@s.whatsapp.net	sent	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:33:42.233032	b3a52369-866b-49b3-8b77-f44dfd51ef4f	924dc8c5-848c-4e77-8b21-84a034bcafc7
99f44491-82c3-412c-80ab-4efcf385f19d	3EB0CFEA96590768EFC729	enc:v2:GOoVktEYpluqE55sQkTR/Rev1Uti7sLS+eofd+Bs+y4=:0cF8i99/OrH2fQBb:AFamhnDe/tmLQ3Zx/qvJtQ==:ZxEtR6hmBqSDsQMj3jm/1y8O	t	Eduardo Barros	573005996359@s.whatsapp.net	sent	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:33:57.791588	b3a52369-866b-49b3-8b77-f44dfd51ef4f	924dc8c5-848c-4e77-8b21-84a034bcafc7
2b86dafd-0659-4978-84bc-dec6a071fc24	3EB0722AED7F7A561EE9B6	enc:v2:1vbudQ5ahxSgS/9RvXRMDGLtfxHsXxWgyzlEsyvs9po=:PuUkFCCiXnuVC93k:In1Mx5HTjhzVKcglJzADiQ==:QfhCV5hy2Oehkk+3Zg==	t	Eduardo Barros	573005996359@s.whatsapp.net	sent	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:39:20.793461	b3a52369-866b-49b3-8b77-f44dfd51ef4f	924dc8c5-848c-4e77-8b21-84a034bcafc7
84451e13-1a55-4705-a86d-e07148b21487	3EB0AE1EC88B71F354D7E8	enc:v2:BNGNNXjn2hoVpwuKL09ajY4PuCcC6HV5WLf8TAJBk/U=:+rljVJlQXVrIPI8y:yuSA2m446bc8REbNW9M8hQ==:nP/r	t	Eduardo Barros	573005996359@s.whatsapp.net	sent	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:39:31.359215	b3a52369-866b-49b3-8b77-f44dfd51ef4f	924dc8c5-848c-4e77-8b21-84a034bcafc7
5710857b-f63c-4662-8bb9-8447c42a5185	3EB02B4F879433CA2FC938	enc:v2:iGf594SzbpIe/1w6VUePa27yZy8azJyN0KOyU8EO7vY=:4kCOpJegFwljjyic:gXX5mKZWyBh3menLZ+HrYQ==:FbXZFIKYhVh/uP7N7/PED/EKkrCnpP8Kzm1NJDhYrIb3sDGk2e6wLosKajpadw==	f	Agente de Soporte Alvaro Yepes	40712263479465@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:29:02.071206	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
a8077bcc-9b15-4246-a968-929316a194b4	3EB042A7E5FE378225C9F0	enc:v2:pFMTDtuUBuQKxSK5I1TwkuatAaUVbh0oaMSv/3ge0T4=:nN3CN7udMyUhPCyg:IPL3P43GC0ij3lKPsMWRUg==:	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	f	image	3EB042A7E5FE378225C9F0	https://innoovacloud.com/uploads/whatsapp/1783542048375-514859478.png	image/png	bet (10).png	60503	\N	2026-07-08 20:20:48.376004	d5f224f3-9802-42d9-93cf-d7e78d23d117	acbc7033-8fa2-40ad-a325-a3c9cb246846
880622c6-717c-4ed0-9304-1c54aac63101	3EB009F7E4117F8B449A96	enc:v2:9S3VxDFQrfQsKHbSOZ9OVgegOyMdsJgDffzGtYk60JI=:+V9CJqxtA3lWLHzH:p58HIdR+76ItHPC770klcg==:	f	Agente de Soporte Alvaro Yepes	40712263479465@lid	delivered	f	image	3EB009F7E4117F8B449A96	https://innoovacloud.com/uploads/whatsapp/1783542602821-473816093.jpg	image/jpeg	image-3EB009F7E4117F8B449A96.jpg	103478	\N	2026-07-08 20:30:02.543199	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
faffc28e-a14a-48c3-9394-f0f009f3f12a	3EB0264F8710A9DD56D9C0	enc:v2:cUblrfjawVKVN3L19YyFqMXYTbY015Fu77dFz12yULI=:mvCuGOi29mncxXvl:HCRvo1oHU1sVmzunyXOxeg==:KSjVzkcspMHHDF68/ES+98nGeQ==	f	Agente de Soporte Alvaro Yepes	40712263479465@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:30:16.903306	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
01b5bedb-eaeb-4e89-89e6-e01539812b1c	3EB097343BEC942BD02467	enc:v2:cCY4Q0WqeHbZIJ+t5nviVhNy3JwJurBPogZ1aXMUHSs=:rGExcoxpm9dQgNec:z38u4B5U2y09CA4QQxIC/A==:oKWttQnf	f	Agente de Soporte Jorge arroyo	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:41:11.832148	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
3ff045f5-c381-4257-9a32-7812f168a98b	3EB0E48FD2A282E2749EF8	enc:v2:HGzWKlnjCX1K7FqLN7A72FJ6JmBWqRhbvqpW7aQyEQc=:kVvzq2KYWfLZTRX8:eM0CYlukq7OssiU5N52H9w==:	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	f	image	3EB0E48FD2A282E2749EF8	https://innoovacloud.com/uploads/whatsapp/1783542736766-180800628.png	image/png	bet (10).png	60503	\N	2026-07-08 20:32:16.769464	d5f224f3-9802-42d9-93cf-d7e78d23d117	acbc7033-8fa2-40ad-a325-a3c9cb246846
65cfa416-9240-45d9-93e7-00e6fd0b8c13	3EB0B60610C74847A892BB	enc:v2:5+LaaBagoYrRaYOKVJjCjLw8dIGOQ7mfjTjU9Glldyk=:KpY2W9c32H43BuRj:3yBjXuXun1J48USv8rek8Q==:eCwCzXfmf2yP2rx6hFkvQPMYAqvM+qzxeAZCDr5zV1h+S7HDzN69yR0tboTUOlYxTuAkR9UX0uZWvPmW6K2W5WeRIpRY+LGn/gEaLnE=	t	Karen Torres	573005996359@s.whatsapp.net	sent	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:43:14.044311	e564ef65-79f5-46d2-8437-6097f73c5bc4	e895dfff-dd65-4a60-ac07-76e7d01d023b
5e2ca3d6-bd12-4753-97c0-ab22069d4ee7	3EB04F90645E6FFE9EF5F2	enc:v2:r1V2W8u1SVTYkKTan3ejOKbtL16UqsVleEgiHSh1T1E=:po5elwt/bfnW5f/U:hk2HhMQqx+eBY/aKLiY3Cw==:pyN/AVHiKNPpSmrKR/isCAPxkGMVvu9dDipgaNL4Tr1WAZMGUsOmCSnIIv5tm+6clbaEo0REvTGHYI3hku927wHw/xkF74Itp8WI9yI=	t	Alvaro Yepes	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:41:29.088403	e564ef65-79f5-46d2-8437-6097f73c5bc4	57fc4406-fc9a-456c-afa5-4c1936b55cff
08de3970-22c2-434d-9e25-71f036cf6c95	3EB0DFF247556A27FADDBC	enc:v2:6R9LI1QUyFl7zJLi1Ybg6AG7ut2YetQhqqZ5ARj8dag=:uSm7zjtIPOHQcHXd:LYZ8T18ZYIdfVhUZUuoMLg==:VxqcHzbIVvDwOTj7hmkmhxNopJvpik7aTHURdwuRKjo4qSg4J7jM7ztGd/nKeDOexGkVywWg52vl3RoDKF49jdzc7QNSgJeR7LoR8eYuzw==	t	Eduardo Barros	573005996359@s.whatsapp.net	sent	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:42:11.140001	ffc3caf4-7a39-4d64-b633-45341a266751	924dc8c5-848c-4e77-8b21-84a034bcafc7
af9aca3c-6790-4318-83a2-1e4e5ed879b0	3EB0BD0C85BB69EF9D86B5	enc:v2:8qVHmi7w2xp0+7glznkBjH8Jt/JNpy9ffuCvxnVcxV0=:xPDxLhdc1hV3nEkz:UemRwrLfKjN7PPYcfis2TA==:9dnQkxKNIYqGa/ipdB9P/XeTfR0=	f	Agente de Soporte Alvaro Yepes	40712263479465@lid	delivered	f	reaction	3EB06E830BAC2C396C21BB	\N	\N	\N	\N	\N	2026-07-09 12:17:34.027192	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
7008b325-356c-419e-b0c1-ec674c83a541	3EB060C4BF1ACDD274383B	enc:v2:irk9cYvNRS4E+rqwH1NZ+iPrMzl/pPv12/dLUlRW3I4=:Rv+tVWKHPX5dvgd4:rhmh8/N8o1SXvT4PjT6xdg==:urWKWduzhJlEzlGBINIMfg==	t	Eduardo Barros	573005996359@s.whatsapp.net	sent	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:42:33.653106	ffc3caf4-7a39-4d64-b633-45341a266751	924dc8c5-848c-4e77-8b21-84a034bcafc7
72ab6520-34b8-4b5e-bad7-bde6b0f04c6f	3EB0D25372C5AA8E757C14	enc:v2:uQ42CpAVlgtl5oSwpptg0owXqzCZFXhetaX4gtnukKs=:LWwMKADhoEVVYRw1:y7F9IUWk1hcTy07T0woYDQ==:kA50UcBe3BjhdEIozDFBM/hxZlpVOUeebwF2D42Q1oc3qQK6S00wCeKbqD4cohDMchl1wOsNO8e2bqrkI/FQGZz6tzkSkiXIEOGXjPm8aA==	t	Eduardo Barros	573005996359@s.whatsapp.net	sent	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:42:11.793407	ffc3caf4-7a39-4d64-b633-45341a266751	924dc8c5-848c-4e77-8b21-84a034bcafc7
4871c100-b2f8-4495-9e1d-51677f69ccd6	3EB0196538D86B4082518C	enc:v2:V3eBXpzEiYZbh9vaNHFphbUgqcSN0rKh4QBhdHpEBuo=:cm1BpO/SuSaq+gI4:eyvQ9IcW/pbFZYfnDK/Kbg==:GfUp	f	Agente de Soporte Jorge arroyo	33247912284290@lid	delivered	f	reaction	3EB06E830BAC2C396C21BB	\N	\N	\N	\N	\N	2026-07-09 12:17:44.006752	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
cb4fbc8f-abeb-445a-ba1a-67e191ee58c3	3EB0593AEC5DEA968A963D	enc:v2:6YcqzQfWNuZgs+Yw1gLNVM9zMGjW7mPrM3eU5Skyrtg=:4/rw3wpr8G7qblLq:mmPY3cQk78WHbg0o8Mst1w==:VhLuifnrur1Qs0QPRU0Mnr9gea+heFmu27RnZnk3vxYDMjRvZj/okNelG7sTvgOYfWpZXS8qs7IeVXijeReRbeIKZM98L5bi/qU7dkEQyw==	t	Eduardo Barros	573005996359@s.whatsapp.net	sent	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:41:59.492782	ffc3caf4-7a39-4d64-b633-45341a266751	924dc8c5-848c-4e77-8b21-84a034bcafc7
c8b082ea-27dc-45aa-87b2-583ac7451a47	3EB0E6F16C70F792C9346C	enc:v2:5mdO2bTTXlU8TGXhH+TEnxDgLRTH01I5MLfAKlds5Kc=:S2PGXaziFuQgyCG+:UmCI3Ag3KIGtZIYBTHCtTw==:82tEeCAIGOO6dPZWy5jNUZlMmhGE0ewsyHszbtJhUtORQ6qx8ByKtj3cpfRG/N07sl9FZXHz6VD/YewGo22oqQNqUUlRfP0f3sbcD0OYSKrxYpVxwrA=	t	Eduardo Barros	573005996359@s.whatsapp.net	sent	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:43:11.065915	ffc3caf4-7a39-4d64-b633-45341a266751	924dc8c5-848c-4e77-8b21-84a034bcafc7
554a0ce4-d3b5-400e-9759-95cd195f39a0	3EB0DF56DA2510DA17A004	enc:v2:5kJUHyBbINZtRHXxkyjg9l7n6q2yOiSCJ4wq2/iW5SU=:rAnimhRCI9RO4OMN:fcWlRgd2/f1qr8CaMBOgpA==:DTIb6rr0AH/YKzOF4okxeJU4jJrFitDdNS/PGAUbtWURtWLbtGpZMn56H7aXQTI=	t	Karen Torres	573005996359@s.whatsapp.net	sent	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:56:00.927275	e564ef65-79f5-46d2-8437-6097f73c5bc4	e895dfff-dd65-4a60-ac07-76e7d01d023b
a41b6dc7-48b6-4a81-8eb9-0e9f0ea0e802	local-reaction:3EB0CFEA96590768EFC729:924dc8c5-848c-4e77-8b21-84a034bcafc7	enc:v2:fslt30DDoL7Rw98feZH659Ach3SCCtXPPR9r4/wxS18=:xGLJQ9Mi9H5XwMXs:pD3iJTcWGL6yVmV1f3tY5g==:AsHT	t	Eduardo Barros	924dc8c5-848c-4e77-8b21-84a034bcafc7	sent	f	reaction	3EB0CFEA96590768EFC729	\N	\N	\N	\N	\N	2026-07-08 20:56:15.774851	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
7dd2b4f8-fe9a-4911-8d72-1713562fc313	local-reaction:3EB0264F8710A9DD56D9C0:924dc8c5-848c-4e77-8b21-84a034bcafc7	enc:v2:t2BZEhjjrR3kXUbPmnENBfYA2rOW4kwEq+bDvG3y3yQ=:mMtYt0t+X1tz82fk:C01C9B7k67FXw5nW0o9SxA==:7cnT	t	Eduardo Barros	924dc8c5-848c-4e77-8b21-84a034bcafc7	sent	f	reaction	3EB0264F8710A9DD56D9C0	\N	\N	\N	\N	\N	2026-07-08 20:56:17.705897	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
a41c6a72-50e4-4970-85f8-e464719f39ff	3EB04B52C22A8782B8F4A7	enc:v2:5bHATvxuVC2fJvxOvvTDmWWju9wGKosBqjRqAB2tf5A=:RawR9f1YkSN4sx9K:3pqjXHnY4AloEhPT3QbaaQ==:WFRgt94=	f	Agente de Soporte Alvaro Yepes	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:46:38.715604	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
bfbdb421-730f-4514-b5ca-b1cdb92fcb21	3EB0C1A6F8BA9C8A6B3C7F	enc:v2:TNmzl64IQPkubHtBZ4MA63K6fBmZjtUwERGMGmLp50g=:EvXKqmYLopFgw3tE:kspiNyeMzVdgR1aPX+lCKg==:+eb2ZXukqYT9eBVGL0HS6U5Ryl1Q8j9QVz98ddj1u8AIcCZAZ2lFOUjUHBSlFKJmegjzMurqZP0Ru6ZAewxVIwD7TvNtAMqU437/XFY=	t	Karen Torres	573005996359@s.whatsapp.net	sent	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:43:16.44676	e564ef65-79f5-46d2-8437-6097f73c5bc4	e895dfff-dd65-4a60-ac07-76e7d01d023b
968e69d6-bcbe-4a2c-bc0b-d47468d6b292	3EB0B7943021156FD0312C	enc:v2:fSylU+FAyFBT3f/cYUA81DELUcajUnzE6eYg2Wtsz8w=:YSihdOzBBCq2Lvyi:XipCEFqHll+OEu45SvUvLQ==:cWWAbRBrBpvgCU/GqrHYzWo=	f	Agente de Soporte Alvaro Yepes	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:46:45.405879	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
51df7dc8-9c39-4be8-87e2-9851484cc092	3EB071836C383B86978EA2	enc:v2:zXRhazZncj0aKYa5nzs6BQ5Vhv7iglrkAKxCfyVYhmk=:13hYhr+aFRqaWx79:2TKR7+sDGB19yYFOtOUA9Q==:oNXg+TDFXNMyRMzaf0/F6bZpKhv9lPVaKVWezzDc4+kCrn8NoaprGM5s76zYJhyqEcgwqe1iZ6wUG93f7CfdJ5z0tsIqgg3eTXJ8FAc=	t	Karen Torres	573005996359@s.whatsapp.net	sent	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:43:23.526795	e564ef65-79f5-46d2-8437-6097f73c5bc4	e895dfff-dd65-4a60-ac07-76e7d01d023b
12d413d6-c133-46c2-8e21-b687d18a7629	3EB05E73679B87B661429D	enc:v2:LDqa8JrdugKLNuJlrurmVfxVKc0RIFWbADgQY6bA4FY=:gQ0A+kIX4VvvM3yu:kYOa1bt80EHsgcQwlGfxFw==:UKS1hxs76GKA6upuPwEHqRAhzR37YIQ=	f	Agente de Soporte Alvaro Yepes	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:46:46.701816	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
8cbc3983-7d09-4f03-a86d-cbe4d0a467d1	3EB06282A87AF3A59E3C79	enc:v2:tWDEYCAuzdhONLL4EpI6J9b8cOWotYKrk22n0y9PaIc=:gn/ME7PXxaC74qZH:G9orn5/lGn+SR7acxJZ1bg==:qCqoU1Iz5C20hcIVJQ9i	f	Agente de Soporte Alvaro Yepes	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:46:49.703423	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
1e3c6282-8815-4158-ab9e-97ab55d0f389	3EB037425FD1D0FB479294	enc:v2:3Zf3NNeuOqDELIf5Pn2Lh/yOAVaUDY9VTOV04aN/PYc=:HhE+FVKE6vCkR2qV:pZTfIRN5fbaO23t9ZFp86A==:RfI9hNSbGIN9	f	Agente de Soporte Alvaro Yepes	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:46:53.19983	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
7df07dfc-948c-4987-aa21-5951ef849024	local-reaction:3EB02B4F879433CA2FC938:924dc8c5-848c-4e77-8b21-84a034bcafc7	enc:v2:mi9FtxZO9zJwsiixLc0rNxko85zW3Zd/xfe8xmnjg+k=:7yMFas5cCjjvVfzG:3rKsNMrWhhILsYD7QbkDIg==:N4AA+Q==	t	Eduardo Barros	924dc8c5-848c-4e77-8b21-84a034bcafc7	sent	f	reaction	3EB02B4F879433CA2FC938	\N	\N	\N	\N	\N	2026-07-08 20:56:20.160946	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
81b391ec-c3e6-4bda-b7de-add7196ae5b1	3EB08870F13D80FF60CBCA	enc:v2:tubhn6CqzveTzB7D3smjetF6Vzq254ftfHqFzwWB+A4=:5vhzBMZDVpCK4TOj:KVibVmP8vz/EWCrFWtZg3Q==:E7o=	t	Administrador	573005996359@s.whatsapp.net	sent	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:07:16.91617	e564ef65-79f5-46d2-8437-6097f73c5bc4	4c436cd8-43e7-4bf9-8fc3-80778e6c4c7a
ec515e70-cd6d-4130-af7b-540282257ebb	local-reaction:3EB0722AED7F7A561EE9B6:924dc8c5-848c-4e77-8b21-84a034bcafc7	enc:v2:AUUOBRQqyhPTtu1XMp+36+j/GdeMKwxPvFrTFcugJBM=:gDO1+nhJGhrdnGpv:5NTilk7yjGv38sgFZCD6PQ==:cEBW2g==	t	Eduardo Barros	924dc8c5-848c-4e77-8b21-84a034bcafc7	sent	f	reaction	3EB0722AED7F7A561EE9B6	\N	\N	\N	\N	\N	2026-07-08 20:55:59.952294	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
f8147d10-5d16-4959-835b-a120e0e2787a	3EB02C72F0622768510738	enc:v2:X4/mt0uqDjqJ6FkcRMzegCM9Zj55WpmNBUiMFa9jxPg=:LKDm+sjFTCgEgMFS:D8k5+mUneKy/3tKziHJlMw==:3n7HhT2Y1zLs6du3N6FpVKkoWTQ9kVYCYXrUBXvE2Rxu9NU5FZe26MdKwxK7QmmAAziDrAVVOlLhZw91MVftTK/y/25p5K5WtLxjUg==	t	Jean Muñoz	573005996359@s.whatsapp.net	sent	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:07:24.15936	e564ef65-79f5-46d2-8437-6097f73c5bc4	9f9aed89-962d-4271-aa03-224ed1fd2e82
c95a630f-249b-4637-be3d-50a5e08f20ec	3EB093A6474E1BE66FD7A9	enc:v2:fj6Givm61Qk0rOuYQvI1IfI49jJ8cNGZPWy6CI1fVY4=:REm88wozKEvqvhYP:QTxuE50qo1g7jVRxuybqWg==:fF2w3fY+EeZIpOaMCxLq0kUzUQ0/bOQ0vN1AwptUdD90arwZ39T5y5orG0886exWlaDcJeG1H5dskn2O5Z4DwAoTx5D8pXG2eawxZkJYgt6lxxw5Hg==	t	Karen Torres	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:56:52.263595	e564ef65-79f5-46d2-8437-6097f73c5bc4	e895dfff-dd65-4a60-ac07-76e7d01d023b
7983be44-b84a-43ca-a210-3736ea3ed5c7	3EB0D2CA12C93851C30FF6	enc:v2:gijOggh7eOpyq5xjTBelfaQZDA6A8TDpJ4+wfPZksjA=:q+xr1MrEZIDcukpZ:c++bq81sUapD6X8Zu9L2Pg==:SahciDeJkjIx7EmKbj8=	f	Agente de Soporte Alvaro Yepes	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:57:14.65277	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
5792551f-26db-4248-bc91-8f04c858b96e	3EB0F005E5ABD9EF0E98F3	enc:v2:VmAxVi0bjN3vOgo9S3Al6/D5DgC4Zu6RxV5Hmdqbv5A=:U478HzFa92po4HA5:q4s1fY2x2q5UNALGfgf0+A==:AifGyrX/iO5hAVcQ	f	Agente de Soporte Alvaro Yepes	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:57:20.826814	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
9b86f1fd-d5bc-4f53-9d97-a89eeb6a0931	A5437C11237A03D533DB5BCA44248006	enc:v2:ALWtxVXsvn9ai+4SIa8z/FKkLRowfvsB9vsayyI7zg0=:Ab+Ip+ZP5jjcLnAn:0tcsj+6b4mxpHJM48ZVNXQ==:x9tPcXIe1mo73nwrjQwwrsOzNYLoOe2Dyup6oAy34FmmfnOwkE1z4O+giRrYAVJIv+JpfC0ciYxapdbluMkmN8musAlM8VsDIcp4JZLyWNQJL3PVn4zm6kIXMSp9oClNdiw7BWcXVU2Q8eZYkG2G+nOK/LZB4jP9LUIhuN6WPulTr1U/Wv19DtFMiyvPeJ//qTbkHFoALAEjSiT2Qv4ftZw1a6931NQZFNLktnEfnRw96n77t6vC2sWvYH8G9u5do/LhpFl6GRLiCBqh7LYohgMfVDkAllCvabQwVz6Ksza7tDF6DwJtNZfW3AV5DMXuQ0ObsAFWgNROr1VO9UnMDC1ntUsQMGo2o8RAn1TJPUSFPZ49DBa5DX5XwFqGxMJGfLcQXxFpk2CDN0tvSf1rsxsCI74ceg4wiQXeq+1Mwa3IB958firSxwppO/9BnDW3W0YTZIQ9VLr0bioc0g++Sei9RqpOkC7lNNdtAj82lqbWjXms4BLnWeLIXWBzh/6t0zRV	f	Agente de Soporte Alvaro Yepes	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:07:25.9381	e564ef65-79f5-46d2-8437-6097f73c5bc4	\N
424938dd-133b-4836-88c9-bfa61c21618a	3EB04269CD6BA097937730	enc:v2:rjlViFGzoc8fSlqRYHyKGXzUE00TPPezQ/amNN8dN1A=:v3Es5l59Ios9fb8S:PUuPJ62Ujiig07YjVXIGbQ==:zJgYTg==	t	Administrador	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:07:36.189701	e564ef65-79f5-46d2-8437-6097f73c5bc4	4c436cd8-43e7-4bf9-8fc3-80778e6c4c7a
538c69ca-99e2-4ca1-b97d-5b36b87cbd76	3EB088ECACE87BA74B57B4	enc:v2:Agg/It/BRuQrZSyVEbbTauwVFThG7H4eyW0vfzTGrqU=:aO2o23vvhpTqX59R:2GPnMZgspGgJiIzcgBG4GA==:NXLglUE0ee6YjJgOujkUAz3mpYwmO8IWtLOIZnhIJb7IPE4500YMyeOhELZnOQQ=	t	Jean Muñoz	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:07:48.325042	e564ef65-79f5-46d2-8437-6097f73c5bc4	9f9aed89-962d-4271-aa03-224ed1fd2e82
5ff32268-c3ad-41b7-bfcf-85b032452e70	3EB0EC73BF2EE5B5C8C767	enc:v2:p0Ywh8yOFpHcPbX+z7TQ48KsOWoifLLlozhDUTggnAE=:Ag68hMlTio+OOp/D:iea4g4pl0FFit/X22HEm7g==:a73106G1F5R/X/XiZrmTaoUiyt+br/LnHxjNXWTUVL+LUos=	t	Jean Muñoz	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:07:52.398572	e564ef65-79f5-46d2-8437-6097f73c5bc4	9f9aed89-962d-4271-aa03-224ed1fd2e82
34204548-2aca-4767-adf7-34178b076a94	3EB0EED0668F4BEF02BF68	enc:v2:9AcW7e6D1YOWsIbBg2R1Hw/JGWIw+HitnUbyR7sygyE=:LDCXKT0Sp0kNh6oT:L0+h9vJz+SYYKWr1nSA3YA==:Z7jRqqgUwP8Foybxqv3wQpS1OHg=	f	Innova Cloud	148567800967258@lid	delivered	f	reaction	3EB0C46356F51A71F5F7BF	\N	\N	\N	\N	\N	2026-07-09 12:17:51.893746	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
47d0d9ed-6516-44a7-873c-75499ffbc8f9	3EB05C65618B6BBC9B7B26	enc:v2:8onJgSrfoCgzAB5K3y1SRrtdBMexBQRsdajipZ3aKtU=:DkWczw8WO856I7fr:P2uQ1WWcbqdGyb6+iqGnLw==:WjK3	f	Innova Cloud	148567800967258@lid	delivered	f	reaction	3EB06E830BAC2C396C21BB	\N	\N	\N	\N	\N	2026-07-09 12:17:59.508482	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
b0390b51-0be0-49cb-8565-080dc30f15db	A5696EE73C69F5C5EBC2CE9112CCB07C	enc:v2:DIEE2epi4Jt9Qv14Yeu6ozYYHZLqe223OANCW5eQCvI=:+9NbgVa2fI1prkVh:81LYltajWhWsBfyQYD+PQw==:sP5LXwOVAEuj8XllWKLdwNq4HqrVy/cIX2xne1t1oZ7PbwlRrEx7oEr/AKUZyfgiHjdagxsmiFVgDc2PJtD6rO9UcwTuzCwvGb5Iue+vf5d0EKM1VOPFIZkRRI1A8tjFXBrTqA4D8TVdz19H1UEMP4t0zvsyqbfAMK7MrTG9PGvTjRfbIGSa7jVsG5fY5TxYdhYGdui3HslPHnUsGbSIPHkFHwTGX6LcswJion1F09W6n2K+YuoRORMw1xJNZLzlO0TXPa/22gritdrVC1GQIT3gY6eCjug6zoSQTCk4HqOu4SNJ+JOhmmT+6G5nigNzeMf8Kuju36bl//UclVJ1HV1tNdIebqhxwp+jXgq1i17/IWpXgG/jm99LvFKTYGsdPVelghJ4nvdJEX/xMMY6qiqn8DEF0YHMTVOol2iZY5sNq3gD7HIWXcZLN+lUsviyRKa0ezgYg3Su8+l1522PfHXYghcbcXJQNXHE+pjs2wPRWmjTuC98jXeEdTPlmuAQSinQG9KHekBRgWJU4iS3J4k=	f	Agente de Soporte Jorge arroyo	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:08:17.094359	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
f166712b-541f-41e0-aa9f-9a1240285e89	3EB0C13D01C9B8CB321BED	enc:v2:XNojOZgWVoGNPby3A8f5hODIoHrDja3KdJdMPswHfTA=:C6+uGopLDlgg3s5k:2MXPByImgcLD0yezVnbpjA==:2uXMpjjxUCHxyQSnsGdj7YOhHpSZ	f	Agente de Soporte Jorge arroyo	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:08:17.78981	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
0ab89ec6-75c7-4413-afb6-05b3ffdb3315	3EB0AB7EEBA41063A6E49A	enc:v2:HLOspUnDI7Tt0OkLwxe99/rR2IrbCKQnslQOIY+S9jY=:7EU7P5t10VGZvxBk:5lSjYeKBQ5T7DddZPNaV4A==:AV8=	f	Agente de Soporte Jorge arroyo	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:08:33.292432	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
1c4704c6-c97b-473b-a26f-086acf1b1a5e	3EB0DC83E07CA2227CF441	enc:v2:zRZmGNX/xCxABC7f5Bb7pN1mQbah0ZutQbaeIrjOoYI=:4sKQqhYQLsSdSuGE:SoIf3yTBxBY3O6zTaH4JBw==:yw==	f	Agente de Soporte Jorge arroyo	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:08:36.530144	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
e082b688-f30b-488f-906f-f0c2abe861ed	3EB0AE52736AC39E4C50CC	enc:v2:wiFbnsbwQHTN0xbLTMfdkg0wTKUiSu4BTank5gCJndY=:LZiq1JOeQvN3P2qT:wivCXNIvuvB49VkFFU82Cw==:5g==	f	Agente de Soporte Jorge arroyo	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:08:38.824622	d5f224f3-9802-42d9-93cf-d7e78d23d117	\N
a37d16e3-87d3-4e6f-9c5b-b4752a4f3e7a	ACA62BFA5BA5A0EA8194331A8C672A82	enc:v2:29LCBmsOVwofZGMucaUxKPeIAiuS3YjooddzOl9isC4=:h0ux3DtK8PJQyg5M:GjNKlyZF3boRL+rB51hD5Q==:7SHtdQ==	f	Jean Munoz	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 01:35:21.090495	1bea9e01-e99a-49cc-a794-2b54b9313c8c	\N
f22c1b20-f1fc-4328-a743-25c64c6bdb43	AC2FF33E2EBBE3F75D5CA506632B5891	enc:v2:s6ZA4PsVWtQ99z4art3E4kQ4RS2qZYhVltS20m46LcI=:rgPfu7yoswQgPKSY:dm4OlqYV/WLV/xzBqrqqYg==:wg7gXQ==	f	Jean Munoz	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 01:35:25.578755	1bea9e01-e99a-49cc-a794-2b54b9313c8c	\N
8ceded43-3f67-477e-99cc-f0b0db869bd0	3EB0A2B7E392CF65E1C3C5	enc:v2:UZsNt5x+YO5QYqSEEf5vnswOOOzDDv+qEGwbxOpmvIk=:6SQWLryE7nl9cQ8t:sSes3P+IfVFjHOQKgYrVzg==:LhzFvp3UT+Sglc5XUuX/Pl8Y3xwl1cWB5L+xvYXYJJY=	t	Administrador	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:09:28.868552	d5f224f3-9802-42d9-93cf-d7e78d23d117	4c436cd8-43e7-4bf9-8fc3-80778e6c4c7a
a14c96e6-7841-4a22-8ecc-d76b8966cdda	3EB0D628650136E292B019	enc:v2:YAApkfRaVcIEeV8r0NV826I3Fz0Aqqs51zSlW8EUNKw=:W1qrEcHEDZFysh1K:kMknGtPZsFFwzOev4zsO4g==:s3Dels0DIxTx2JzJSzj8SZPPny4CFiJIvCllZLWPNQSueH1c7PltNl6B7napM+FVW1IIpoWBHSjn5e1WzyV5VFN4mCy5AqS2UpbAoQ==	t	Jean Muñoz	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:12:54.782057	d5f224f3-9802-42d9-93cf-d7e78d23d117	9f9aed89-962d-4271-aa03-224ed1fd2e82
eb8b7489-5277-4a4e-b1b6-964511432827	3EB0D4700C18EBC94D059B	enc:v2:BYTH9iKZUiK5CvsO1wG3tGE6X9CRlWO0+h6wQKzINBU=:SujHGdqvYf2BndPX:07M4XMiV5o4TgEwFAI7THw==:EOAR1CX3HdnR//C0XwQ/r3aBjHzAO59BtQpdjAzetYIv7OdwTSjnnsGuRHe68vwJWgC52Ta8Tqu3ZEqOz1JHiVKLO20BuZ7BHJ2KcvuJ	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:13:12.117271	d5f224f3-9802-42d9-93cf-d7e78d23d117	acbc7033-8fa2-40ad-a325-a3c9cb246846
45182389-3395-4f96-9d1a-d6d3fa2b149f	3EB0FCFB2BA110B8318CDA	enc:v2:8qAboQPVMSoMhrkTOmFyQMWqRDQ1jVfcY5fX6HkWyU4=:BlvdAz1S/d02P8By:Uk/Na8osMGuH+BibasclzA==:qmN1nEk6XMx+UVfe3cZTPucNDvqLKOATpNp2SOcQ8jJX8pBFWpK484OQhAhUIhZPTHMS3MZFw3CI3GwcRmGH1TSe4MuIqS6jJ2HxjQ==	t	Jean Muñoz	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:12:41.60178	d5f224f3-9802-42d9-93cf-d7e78d23d117	9f9aed89-962d-4271-aa03-224ed1fd2e82
137da485-f25c-45b1-8485-50ba802d8cb8	3EB0252B36CD4B9D5FC8BA	enc:v2:FxDfNSNu9DLkXzFkEpMBywG3VrK09ioEYEne5nMhQgo=:+N0bqyDCl+56u0Xo:zCI9vZUhgTYJzSKc2K4Gfw==:TLDrfCVEv43wMvtdT40bfxM3anJ4Ojcl8vIytmAmm3dgqGyqbRt8Qp+50jLltYBw6Bt7WfYs1mUqGlcXZvprjuroXPR1sS3smzB9iA==	t	Jean Muñoz	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:13:29.465768	d5f224f3-9802-42d9-93cf-d7e78d23d117	9f9aed89-962d-4271-aa03-224ed1fd2e82
fc5cb4f1-90fd-4e72-98f3-0f7878fb254f	ACD083412E607166D27B75525D48B898	enc:v2:gdDXGo2oYFHMDUQdKl9w2Fs1kJ+ydcwn82xyhpvdR6U=:YmDOI5G8YhcYLaQ5:hQDyOv3V9FYq5Oas+M75kQ==:8ZPkimg=	f	Jean Munoz	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 01:35:10.250809	1bea9e01-e99a-49cc-a794-2b54b9313c8c	\N
f9308fd7-4f14-4293-96ed-f6ec2f3fe530	3EB0C46356F51A71F5F7BF	enc:v2:TRhwnXeCXyRiax3/6TR8A6sQqOdG9hP2y456eHCM5ig=:PNPdhuS2PTRX7uIn:vUmUgaO669oUJ7iK6UK0Ow==:	f	Soporte Eduardo Barros	87819481546902@lid	delivered	f	image	3EB0C46356F51A71F5F7BF	https://innoovacloud.com/uploads/whatsapp/1783599374505-925560275.jpg	image/jpeg	image-3EB0C46356F51A71F5F7BF.jpg	104609	\N	2026-07-09 12:16:14.011972	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
d44254a2-dddc-4d54-b9c2-c000143e1b5e	A50CE58569868B3DBF89DFE05E8BD9FE	enc:v2:uiKDP7Xa2go0X51yG50E1cSj7e2JZfmSyNuvSQW0JCM=:dBlusq6Oe58CXpZn:90R2bow4IlOEBv0gRG+IPA==:5t1mjj0ovyw=	f	Innova Cloud	103676366569665@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 11:56:16.632025	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
26852a31-41c6-4e94-af83-836f765edbdc	3EB002ACC5A4069C733991	enc:v2:xOEomqEx/r0Ht+OwjJbTlPN5YYyRhahqiZHD1RMCr4E=:LGM+Mg4PKUBArjNE:Or4Klq3RnJ/LqFDvlomLfw==:Bm/6ky0sE7pBeCcbMZx3uwsG0seo1YgKuyEd9gaAHJiqPZ/tkoeQxIgJ5NLeyRjpNaxZOIdFqfxWSTCnQXVhtfH97kjKiCSJmV4pNnBh+StJxg==	t	Sistema	573005996359@s.whatsapp.net	sent	t	text	\N	\N	\N	\N	\N	\N	2026-07-09 01:35:10.675765	1bea9e01-e99a-49cc-a794-2b54b9313c8c	\N
f5b691d5-bebc-41f1-a172-8bb06596a551	3EB006350D16E0A9CA38CC	enc:v2:XyHyeb+V0Zr4yCyuLGfZp+kgWnd4Cxb0gJcwpONOVLM=:1M+lz3t65DKlMks4:CXaY9+eHKNf2u8AQOwFSTg==:WMdcalQmSwngacnLK7VEUEbjw2YQ/pMq0/kmNPj6InfdJuZ/bfMYfjvo3EQLANAPrtB23SB6gP7gIUcFZqatTRkFdlDyJ4ADtjRYWg==	t	Jean Muñoz	573005996359@s.whatsapp.net	sent	t	text	\N	\N	\N	\N	\N	\N	2026-07-09 10:55:15.904111	1bea9e01-e99a-49cc-a794-2b54b9313c8c	9f9aed89-962d-4271-aa03-224ed1fd2e82
25ecb406-cc6a-4b07-b0fa-18b5b9b8d07e	3EB0919E79838759FF28F2	enc:v2:7T7GN6gsaSaW42EV/PeIvMbRVpBQewfgKdxW2+ZRLs8=:xibyFly0R4waueZe:IhHfS8U0vT2LGOGZUWR5Rg==:DWpn9MDXB1E4ZFLb	f	Innova Cloud	233246906396733@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 12:07:06.846943	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
f0fa0c91-d312-4f40-85a9-0df3b7bacd79	3EB0E3B9398126924EC4F8	enc:v2:qBpLgtp5qs21XmHp4omC5DIF3lAWlOpsBQEwGfV44w8=:2Fr2RW65JlzScGyR:J2QVnUMI9ncE9cbra5HnYQ==:g7O2qDOpdvQTbpmJ+ZulHH8NcgtkTunoPYoKjSNgdxe7d8LNdOb8S4BEQVrdKWltlQUNdjI7yw==	f	Soporte Eduardo Barros	87819481546902@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 12:16:07.854179	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
28565bb3-ae79-492d-8a5c-47dde7e26f10	3EB06E830BAC2C396C21BB	enc:v2:R5Y59Bk9GAIfTuh3/f7IT/1zftry4/o63dBqW0fftZs=:pYJlSX2nhCz9zHmg:/tqc6ld0FMLHwCLZbXda2Q==:duW+Cy4tGizlxk2YG77NGuuYmrBEuvRd8/ms9GhN6j1zbUXSLPKLNtsFu4SnPALGgFNYGA==	f	Soporte Eduardo Barros	87819481546902@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 12:16:35.855387	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
48781c43-2e33-45a0-9ed7-0221f0acbd3c	3EB01B59BABFA4F2F9A534	enc:v2:mb7weR3/5RraQHoYPuHON9t1oMPjSqsqeqzYuhOtRQs=:tIHDM2YUXRNuMQMm:1fdWG9iTOxSQvAfMsny4Bw==:LQOJ	f	CLOUD TECHNOLOGYS CENTER	215873730129958@lid	delivered	f	reaction	3EB06E830BAC2C396C21BB	\N	\N	\N	\N	\N	2026-07-09 12:16:49.957978	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
dc0ec0ad-aa37-4433-933e-b0417e1cdcf7	3EB0261B68828A112C1F3E	enc:v2:+6H0o6Xs/FgOQdDpoOu7j43GBwh1H9/KKQcTvuW6xQk=:LJnsS/dS4eyjVlty:A6rlPCXXnoSs8OuqBwhBuw==:Pn+5TeNOuvqczSRlE65yzGy2530=	f	Soporte Eduardo Barros	87819481546902@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 12:16:52.611748	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
3367fa8c-1b69-44c0-8f93-c8282ca1fb9d	A560C4B87CE2E8F464BF13609353A52E	enc:v2:6dK5pxdTUBEDZWGgV6HUeATdfi9VFYQVSinOp8L65yE=:f0KAFcOkRNMH+LAi:SUPdRcsWx5bX/DIAXz+uhQ==:b+Yf	f	Innova Cloud	103676366569665@lid	delivered	f	reaction	3EB06E830BAC2C396C21BB	\N	\N	\N	\N	\N	2026-07-09 12:17:26.429003	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
364277ee-f593-45c2-988d-62afd7bf83a6	3EB0DA13D6B72C331F679F	enc:v2:E3keUrNHba2W7rCDSRCK5d1a0roWopG7k5ylYg0qgGU=:SzCOqvVTf7MWi6d1:pg11rbyXi00LC3S6YAmc/g==:JDQ=	f	Innova Cloud	233246906396733@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 12:23:20.551687	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
a002b17d-f3d2-4974-b5f6-68d840064576	3EB0FBB2D9CE365500C2DC	enc:v2:tkPTq7DeuLU7lX5A5QcDh7OwEnicgVHKVAhvkqND5/c=:ioZ5ClyHVb2rL370:y509IKgNYwg8ciwmx7mF8A==:0SVo84Yq4PTSu/xiYd/QQFdIuyqoHU1L2ARLhcSwWO8=	f	Innova Cloud	233246906396733@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 12:23:36.739545	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
a9df8848-81e4-49e6-a081-7d2a761042c0	3EB0988685782A07C1ED	enc:v2:0+8dckw+7eMfQItMpAOs3J+ekSaH75N1tCVcOIYkEM4=:O9gDDJOhRRbpbT4l:KCsDPeWu0iRMvw7K3xkrxA==:o8sPe4S1r7c4TA+QiKYAwrFmJRBEgsfzxBOdAHqCoJQ=	f	Innova Cloud	233246906396733@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 12:23:48.745795	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
109dd5f8-9d39-4028-9ca5-ad3937797427	A5C861751E5EC64809AC347F7919BF24	enc:v2:YD7lQq8axVHtqPbnAZHdt9AC0nj3c6cmAw4ua6/jDNg=:4P7Eqkkp0kr7aPV2:JsDXKp9ByIDYYAtJLiFRnQ==:Ffu/	f	Michell Sollangie	47927674314848@lid	delivered	f	reaction	3EB0C46356F51A71F5F7BF	\N	\N	\N	\N	\N	2026-07-09 12:23:59.80102	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
2c5fe086-88d7-44f8-8b8e-b79dcbc92305	AC324EB3F9F4AA458C2B119EEF47E794	enc:v2:j8Uc/7giOYY4UkQfmf4Ncdy34fTfHuLQrYNxNqUK2gk=:bHikBjuHl22kqVwH:Y23hJtJzVlTyZjNI871UaQ==:UXyWNQ==	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 12:48:21.839383	1bea9e01-e99a-49cc-a794-2b54b9313c8c	\N
a7871b58-19ba-4fce-bf09-8b4862bd71d4	3EB0FA084F645BA7FB3DA8	enc:v2:McrjLWsifWHaGmkMe8KVv1+5nQRhBygMRVG9IAailjM=:AO3ZgqsNjk7jvLYW:rUZhDEUuU0EbL5+Zb54jSQ==:LrACv5k6VGUJ/PVH6X/91usS6yeSRwBeNbJZ0DeLvNxX+WRRxWOJTKlWwuBm9/9XTOtQp0O8tzB/TH1QV6DxE7wB0i3gzqr920E=	t	ASESOR	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 12:48:22.638436	1bea9e01-e99a-49cc-a794-2b54b9313c8c	\N
324ddccf-181b-4d05-b308-ba0e669bdf33	3EB02E1F1F52CCF34AF98F	enc:v2:46jvsQ152FPZkqb/yQCgSrNd+PHB6wujx5KMaC3Mug4=:ay3AiyYwQePOHLxk:JaenevQI2DgjVqr9b7eFhg==:kcbBK/XO1GCfru2SY+SeIY1SP7LB1zoJ1yQIK04bKCbqzwnlLmqouJclHL1ygZxpgen50JUvrnPSVX87X6z6qOXL/vz+kBk=	t	ASESOR	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 12:48:41.794641	1bea9e01-e99a-49cc-a794-2b54b9313c8c	\N
d192983d-0ee3-41cb-a6cd-58f0a080bfda	3EB011CD0308F41C9BEB48	enc:v2:b3kn6Zi3Bvg42S+TIkT2b14mqbZOoqcP9GKqumf/CSE=:PBbr3TleLuE8hjQT:bO4ZjxGbim0EKv8dde68sg==:csy3ztuwoRw+g8/Wh1tPhmys1ksJbhA6QmvAbXhObw==	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 20:20:30.348536	d5f224f3-9802-42d9-93cf-d7e78d23d117	acbc7033-8fa2-40ad-a325-a3c9cb246846
5e9312fe-4ab4-4c54-9a30-b0419821c882	3EB0C8681EFD56A1346242	enc:v2:0iPfwR8XLOISMX8N4eqazxPNZo8C3P5+vu65kItNXBY=:btR+zbggik5MHlkq:0jEFDQ+Hf2Q7jlRn1MxLzQ==:kYo6Z0Z7dy5/f/UF6MO4VDqpSq8AkutSAqQBf3iI99cHGyBj+kA4g741Fm+ODQJ/HupwtNL2KHnlfw4YKDStKGcZ68YMixAx81VRTQ==	t	Jean Muñoz	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:08:02.987344	d5f224f3-9802-42d9-93cf-d7e78d23d117	9f9aed89-962d-4271-aa03-224ed1fd2e82
7241b66e-ac42-4bf0-b3e2-e8d86188394c	3EB092FE177C4B4F4DB86B	enc:v2:1Z47EcxrkbgB7LkwXJijT2oP2gb8lDEBIBRO8ZtLiDA=:yKjC9pZ3RZ/Xb4RJ:noQjl9UZU7m8IOYihIGaMA==:ABP7oxJSGSn0sk3Oh7to3NW9x/Biyg==	t	Administrador	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-08 21:09:11.517056	d5f224f3-9802-42d9-93cf-d7e78d23d117	4c436cd8-43e7-4bf9-8fc3-80778e6c4c7a
0da77087-b71f-44cc-a932-3e719f137aad	3EB0EF2BD21BF05E32791B	enc:v2:LngmJpkV81reXnYXaj86KSSfzeMgiiJJfK85zIuEILU=:1VIb1pU1TuKcKHNh:zLUFH0/YaSAgHJRNTgZPIA==:	t	Jean Muñoz	573005996359@s.whatsapp.net	delivered	f	image	3EB0EF2BD21BF05E32791B	https://innoovacloud.com/uploads/whatsapp/1783605176663-763004189.png	image/png	bet (10).png	60503	\N	2026-07-09 13:52:56.666586	1bea9e01-e99a-49cc-a794-2b54b9313c8c	9f9aed89-962d-4271-aa03-224ed1fd2e82
e8251763-805e-4178-8952-97f517c3cbab	3EB013B880B71903A554CF	enc:v2:MBKgWcXu9LQ1QS4qa4pW+3qBqS5E/Eu8VJH5rOqJyBs=:bQg+C/TM7R22YIxK:InmDuFlYkya75ZleoSe4XA==:	t	Jean Muñoz	573005996359@s.whatsapp.net	sent	f	audio	3EB013B880B71903A554CF	https://innoovacloud.com/uploads/whatsapp/1783605195562-534970564.webm	audio/webm	nota-voz-1783605188532.webm	71017	\N	2026-07-09 13:53:15.563445	1bea9e01-e99a-49cc-a794-2b54b9313c8c	9f9aed89-962d-4271-aa03-224ed1fd2e82
5dc9727d-b361-448c-bb1a-eb28e903ad16	ACABC996B43A16D42E1E8E76AA35E4A7	enc:v2:gHHqNs45Sm850Sn26TennS3fXUmp6Qq6ScZFltnWpoo=:fDd7z8KB95pVk5+u:dZEkl8iSXRli32UstEEzwQ==:	f	Jean Munoz	\N	read	f	audio	ACABC996B43A16D42E1E8E76AA35E4A7	https://innoovacloud.com/uploads/whatsapp/1783605212883-665871010.ogg	audio/ogg; codecs=opus	audio-ACABC996B43A16D42E1E8E76AA35E4A7.ogg	5092	\N	2026-07-09 13:53:32.611245	1bea9e01-e99a-49cc-a794-2b54b9313c8c	\N
742aa380-4554-48fe-acc6-f8058acebc53	3EB09C463533C24E3244EB	enc:v2:HWYh/EKjvWHmVxww94yt4iLCypTwXkie2JWOnTbk7aw=:rw07WiRQZyQmmVCd:hLp0a1TfAtBN+pB2EzItEQ==:	f	Agente de Soporte Jorge arroyo	33247912284290@lid	delivered	f	image	3EB09C463533C24E3244EB	https://innoovacloud.com/uploads/whatsapp/1783606477303-955257545.jpg	image/jpeg	image-3EB09C463533C24E3244EB.jpg	22791	\N	2026-07-09 14:14:36.920715	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
fb3c033d-6678-4b32-b6a2-7742aeeeed53	3EB055D01FE86C55E70446	enc:v2:aBonR+PSquI5itx6v7CNZnVrdw9gqd3DCbvIkHfElVg=:3jswp5ths51Lu7xe:yBLjGYd3zwT1HgoTstcG1g==:	t	Alvaro Yepes	573005996359@s.whatsapp.net	sent	f	audio	3EB055D01FE86C55E70446	https://innoovacloud.com/uploads/whatsapp/1783606594156-892432373.webm	audio/webm	nota-voz-1783606582859.webm	155217	\N	2026-07-09 14:16:34.161183	b3a52369-866b-49b3-8b77-f44dfd51ef4f	57fc4406-fc9a-456c-afa5-4c1936b55cff
e6fa6321-7148-46d9-b147-ceb92f28ff3f	3EB019C23BCACC881F6759	enc:v2:AESvzLhekNLbfqAHYOtIfReMRl29L4+9a42+N03a+jY=:rEVlOnmzd+iUs442:pjmoVbllHxNnIzGM3ePA9w==:	f	CLOUD TECHNOLOGYS CENTER	215873730129958@lid	delivered	f	audio	3EB019C23BCACC881F6759	https://innoovacloud.com/uploads/whatsapp/1783606669136-246713184.ogg	audio/ogg; codecs=opus	audio-3EB019C23BCACC881F6759.ogg	2998	\N	2026-07-09 14:17:48.87065	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
5bcb8402-c4ed-4117-bf4a-9333ffcfeea4	3EB0A4D522C814E9456F29	enc:v2:YMHF9rNxZLF0nJKlDDpmTS1oEsy3m38L7U57nYSancQ=:FQItsGvO48vZT/ft:YrM6q4WwhEVr04LP8Eo9tQ==:xWYeYZqAtUt6eUYi0xsPRmcSMutj78GAKKbHjpsxo3ZXrR/eUUpU7rpp2aIYni6+aGgijZjdIQCme4QGy0MwCfYIWHu7IaO7I20EOoP9	t	Carlos Agamez	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-09 14:25:08.550886	1bea9e01-e99a-49cc-a794-2b54b9313c8c	acbc7033-8fa2-40ad-a325-a3c9cb246846
7bd4b1d6-7482-469b-a862-0b7c1a73869d	AC3E67F3CD756A850B7981E004A831D7	enc:v2:avP5XvknJjMk1umODnmuooQJ2plR8nXREQ3AaNbuHmY=:BsZGYkA6WhivcXA9:aaoO1mWi/C6DnjL6awl+2Q==:dXwCPg==	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 14:25:37.344567	1bea9e01-e99a-49cc-a794-2b54b9313c8c	\N
a38b4d6a-570c-4231-b93f-d69d7bfa31b9	AC4181EA5C351C22FE4908EE2C85AD79	enc:v2:SlK2chQlxAQIRFzDlcg7vfNfoJuiIQYikz5aM0d0xkM=:xoH3jBOYp8NsHyfs:m27OScM4mHUgfwAvVMAT9Q==:VkdzflM=	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 14:25:39.462888	1bea9e01-e99a-49cc-a794-2b54b9313c8c	\N
347d8ca5-7725-469b-8b50-b809c873749c	AC01302B85A6719ED3CE0CAE4D0A9FA0	enc:v2:dpcE3Lqn09x7Cq62Bah4SwxEBY5jqhuetX9W1TlSDak=:4j6tcg4PsPC4d401:bkQqiEx67X0q7Z1uJ/enNg==:JaZgNAmx8seW	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 14:25:52.704682	1bea9e01-e99a-49cc-a794-2b54b9313c8c	\N
de1a1923-f954-44f9-8d5e-725a94df26f5	AC15881A7062D8794F8EB2F4CA0982A4	enc:v2:z9X924XfpbSqHCIeLIF44bemqfqLvFTO0a5B7csA5lk=:tKwZRH25CnfyZfnI:ltqDv6VM+VYA4GYZclGl5A==:1ELJTA==	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 14:26:10.065825	1bea9e01-e99a-49cc-a794-2b54b9313c8c	\N
aa05a666-4f73-4773-9966-ed7904a5b19d	AC9746ECBDD57FF46E077D64B15D2799	enc:v2:2m96H5o+mI+/5QSXxRXrII5JoqA957nvgWPI/BWXgi8=:5ZkbhEFLffNKMkSw:f/9ZnR/STX3DtEXf/Mk3CQ==:msO/kg==	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 14:26:17.287571	1bea9e01-e99a-49cc-a794-2b54b9313c8c	\N
ea7739cf-0db6-4b97-9bb8-58439e2f602f	ACEF560BD6CCE7BD6E8CE8FE9B406FD7	enc:v2:wpzNFHcAmlH9G/X3cNIKAu2nvmL+X2xbwCVqCTiiYAw=:I4vdhYwur+6fAxOg:SfYwwHcyg0t3VFuGpKasmg==:L8bPK6VMVJIy	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 14:26:28.095918	1bea9e01-e99a-49cc-a794-2b54b9313c8c	\N
a3a79da6-e03a-480e-bcde-4ee9ff0c0768	3EB00B4978397D8A4AF3B3	enc:v2:8BRPVkL3YfRwdk9SKal63h0cAyqzqVpO2mdDBlpS0PU=:t+sQYagoWYmohicl:7zBZKbjRbgp59vNPO89oWQ==:4JW/8yDqLD8eNCN2eA==	t	Carlos Agamez	573005996359@s.whatsapp.net	sent	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 15:18:20.735702	b3a52369-866b-49b3-8b77-f44dfd51ef4f	acbc7033-8fa2-40ad-a325-a3c9cb246846
6cbc7fc3-d143-49be-ae05-43c6c9104ead	3EB039CC055F92BE1E96DB	enc:v2:NUpzXBjfX1RzYGdO0IXkTDDasQb/1/6eeeh6TwyaOG4=:/ge0apKLlMpDoh84:sc8QAKMPLmGCW3j5GE4PbA==:ALfC5emwjKcVfSJr6Ev2Qlsw8c3qw0nJsTu0qk/K1ggw/FQ9gGySCatTwz8r9yIySbfg17nqxYoz0BwBKY35k56r7ThXc49dURR5q9xDmDbrXIXT+1tw	f	Innova Cloud	233246906396733@lid	delivered	f	image	3EB039CC055F92BE1E96DB	https://innoovacloud.com/uploads/whatsapp/1783610360852-729400299.jpg	image/jpeg	image-3EB039CC055F92BE1E96DB.jpg	34171	\N	2026-07-09 15:19:20.385586	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
7aded20c-6028-4afd-814e-9e409ffad99e	3EB06E8B635CD66D834311	enc:v2:uyg4XmU9H/J9BIdLDFELsEMvCSmybL31gBzZm0F6/Ew=:g5OBqs1ShB/h19ub:33VrvokDDDOoEQwoJ6SkhQ==:J67CpJMaYFFKH9fB01ZF3ZzIeaISqLB7HWLcl2pRDxlabbrU6VsQDK7S48HTY2gzLQulY0S/j3XV+IHLDcCF/35n1nZKY00cbF5A0wE9EZ7eoJcX/KR6h5YWE3OTfzxAD4HyfZPm0F0RDlQUOIMXP+ehmNKs77+6svABIdZv3SAowGIDgiFgW2Nm7kN/KCByRwnaxsDHsvJHyy0sMNqliD86L5GpOBD+fRkKQEcA5HtcSeqQuO0lFXCupHK3fLWM3FZDk9C4USQ3pTyMmtVRWYNO0ibQWHi+zRcPzn8nmVyYQ3JCz7IEoQXml6WAKlQ6e48PMtVdS6+JgflPXi58qf77//Q7QKNQF1tBqadpa2bFnd9N1xJ+JiGBGAda/arTIC0hyWJ/w7G97DXhPQNjVdDw1JfEqorrb9azTCljouN1in2TN8s1iZ8sHqvGS5B/I1ZGfNUJN0KIOVkmDipjq818d6xs4tl+QV4cPnSv0tUoxiYAUYMz4SA=	f	Michell Sollangie	47927674314848@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-09 15:23:06.977891	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
b4108e91-c9b0-491d-895f-f388639a0c4c	3EB01B4D08CEA25F616643	enc:v2:YFZkMqqUtcnudZ2vfELiDKaiDo01WnXrBJzNfGBUD/Y=:b+TJyD2n+3LfQXth:whinHI3ZReHJ5T3DnIs36g==:sscmIg==	f	Innova Cloud	103676366569665@lid	delivered	f	reaction	3EB06E8B635CD66D834311	\N	\N	\N	\N	\N	2026-07-09 15:24:17.594094	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
7fa0456a-1785-45a9-a798-95b695c80020	3EB0E29CDFCA729513651C	enc:v2:PgZFS1iGrMipH/sX7coCkDUPVxOfTuWVzmJBDpvjmPM=:U0gUZNrDTh9bsH01:ylEM1nBf/jXJb1nS6y0hcA==:AAbzXQ==	f	Soporte Eduardo Barros	87819481546902@lid	delivered	f	reaction	3EB06E8B635CD66D834311	\N	\N	\N	\N	\N	2026-07-09 15:25:21.420564	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
118e5939-7ef9-4c83-bd13-37f1f209757d	3EB09F305C9032E2B6021E	enc:v2:fpwv9SSgf6VAUuYi3kIKQ9eDEpACf3F/zG/PhCpktGU=:jlvzqzT6m0obUcHA:7NQvTtli8ZvD/G62ya1/Wg==:/Vo1Sg==	f	CLOUD TECHNOLOGYS CENTER	215873730129958@lid	delivered	f	reaction	3EB06E8B635CD66D834311	\N	\N	\N	\N	\N	2026-07-09 15:48:15.893217	b3a52369-866b-49b3-8b77-f44dfd51ef4f	\N
\.


--
-- Data for Name: widget_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.widget_config (id, color, posicion, forma, tamano, icono, texto_boton, mostrar_texto, abrir_automatico, delay_auto_abrir, mensaje_burbuja, mostrar_burbuja, titulo_panel, subtitulo_panel, chat_url, chat_header_color, chat_bg_color, chat_bubble_color, chat_bubble_user_color, chat_marca, created_at, updated_at) FROM stdin;
805aa55e-fc51-432b-a753-9b7f9e2406a5	#9333ea	bottom-right	rounded	sm	chat		f	f	5	¿Necesitas ayuda? ¡Chatea con nosotros!	t	Soporte en línea	Estamos aquí para ayudarte	https://ia.innovacloud.co	#163960	#f8fafc	#b8c5db	#0891b2	Soporte en línea	2026-07-08 16:36:43.277279	2026-07-09 14:12:15.909809
\.


--
-- Name: faqs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.faqs_id_seq', 14, true);


--
-- Name: colegios PK_0ae630c636087aa3e5cbe45326f; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.colegios
    ADD CONSTRAINT "PK_0ae630c636087aa3e5cbe45326f" PRIMARY KEY (id);


--
-- Name: ratings PK_0f31425b073219379545ad68ed9; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT "PK_0f31425b073219379545ad68ed9" PRIMARY KEY (id);


--
-- Name: messages PK_18325f38ae6de43878487eff986; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT "PK_18325f38ae6de43878487eff986" PRIMARY KEY (id);


--
-- Name: comunicado_eventos PK_200017c571d5c6207815a599075; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comunicado_eventos
    ADD CONSTRAINT "PK_200017c571d5c6207815a599075" PRIMARY KEY (id);


--
-- Name: faqs PK_2ddf4f2c910f8e8fa2663a67bf0; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.faqs
    ADD CONSTRAINT "PK_2ddf4f2c910f8e8fa2663a67bf0" PRIMARY KEY (id);


--
-- Name: documentos PK_30b7ee230a352e7582842d1dc02; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.documentos
    ADD CONSTRAINT "PK_30b7ee230a352e7582842d1dc02" PRIMARY KEY (id);


--
-- Name: sessions PK_3238ef96f18b355b671619111bc; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT "PK_3238ef96f18b355b671619111bc" PRIMARY KEY (id);


--
-- Name: tickets PK_343bc942ae261cf7a1377f48fd0; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT "PK_343bc942ae261cf7a1377f48fd0" PRIMARY KEY (id);


--
-- Name: configuracion PK_42615c5e55d08746ae5accfc295; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.configuracion
    ADD CONSTRAINT "PK_42615c5e55d08746ae5accfc295" PRIMARY KEY (id);


--
-- Name: whatsapp_chats PK_5c6cc8511a2e0188851839dd7d8; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_chats
    ADD CONSTRAINT "PK_5c6cc8511a2e0188851839dd7d8" PRIMARY KEY (id);


--
-- Name: widget_config PK_70e5ae079c172c72a87f874c754; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.widget_config
    ADD CONSTRAINT "PK_70e5ae079c172c72a87f874c754" PRIMARY KEY (id);


--
-- Name: whatsapp_messages PK_807bc612c6b98de7645a99805ca; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT "PK_807bc612c6b98de7645a99805ca" PRIMARY KEY (id);


--
-- Name: users PK_a3ffb1c0c8416b9fc6f907b7433; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY (id);


--
-- Name: ai_logs PK_ac5fbcd483f233f6d9a4cf0b49c; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ai_logs
    ADD CONSTRAINT "PK_ac5fbcd483f233f6d9a4cf0b49c" PRIMARY KEY (id);


--
-- Name: teams_tokens PK_adaf64b1bb7c6a6ff52aa57fa2e; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams_tokens
    ADD CONSTRAINT "PK_adaf64b1bb7c6a6ff52aa57fa2e" PRIMARY KEY (id);


--
-- Name: comunicados PK_b7c8a872410a60e4f5aec4d6121; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comunicados
    ADD CONSTRAINT "PK_b7c8a872410a60e4f5aec4d6121" PRIMARY KEY (id);


--
-- Name: ratings REL_257f863abdd600165060462eb4; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT "REL_257f863abdd600165060462eb4" UNIQUE (session_id);


--
-- Name: teams_tokens UQ_46c28367a536eb73d043d6278d0; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.teams_tokens
    ADD CONSTRAINT "UQ_46c28367a536eb73d043d6278d0" UNIQUE (advisor_id);


--
-- Name: sessions UQ_57ee55aaba2a12539e1d5edc360; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT "UQ_57ee55aaba2a12539e1d5edc360" UNIQUE (codigo);


--
-- Name: tickets UQ_63dd7eb97a9abe1e586c2bbc69c; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT "UQ_63dd7eb97a9abe1e586c2bbc69c" UNIQUE (codigo);


--
-- Name: users UQ_97672ac88f789774dd47f7c8be3; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email);


--
-- Name: configuracion UQ_a4f86a02aa0739bf32fe7001b17; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.configuracion
    ADD CONSTRAINT "UQ_a4f86a02aa0739bf32fe7001b17" UNIQUE (advisor_id);


--
-- Name: IDX_3fba3a0714bb4510d8ef0a29a8; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IDX_3fba3a0714bb4510d8ef0a29a8" ON public.whatsapp_messages USING btree (meta_message_id);


--
-- Name: IDX_490763d0c890109ecc9ce32d57; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_490763d0c890109ecc9ce32d57" ON public.ai_logs USING btree ("sessionId");


--
-- Name: IDX_5f181cbaacb445da957d10b0c2; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX "IDX_5f181cbaacb445da957d10b0c2" ON public.ai_logs USING btree (colegio);


--
-- Name: IDX_fb76301c9172c7b6ff90e0ec30; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX "IDX_fb76301c9172c7b6ff90e0ec30" ON public.whatsapp_chats USING btree (phone);


--
-- Name: idx_comunicados_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comunicados_created_at ON public.comunicados USING btree (created_at);


--
-- Name: idx_comunicados_sender_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comunicados_sender_id ON public.comunicados USING btree (sender_id);


--
-- Name: idx_comunicados_sender_id_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comunicados_sender_id_status ON public.comunicados USING btree (sender_id, status);


--
-- Name: idx_comunicados_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_comunicados_status ON public.comunicados USING btree (status);


--
-- Name: idx_messages_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_session_id ON public.messages USING btree (session_id);


--
-- Name: idx_messages_session_id_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_session_id_created_at ON public.messages USING btree (session_id, created_at);


--
-- Name: idx_sessions_advisor_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sessions_advisor_id ON public.sessions USING btree (advisor_id);


--
-- Name: idx_sessions_advisor_id_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sessions_advisor_id_status ON public.sessions USING btree (advisor_id, status);


--
-- Name: idx_sessions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sessions_status ON public.sessions USING btree (status);


--
-- Name: idx_sessions_status_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_sessions_status_created_at ON public.sessions USING btree (status, created_at);


--
-- Name: idx_tickets_assigned; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_assigned ON public.tickets USING btree (assigned_to_id);


--
-- Name: idx_tickets_created_by; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_created_by ON public.tickets USING btree (created_by_id);


--
-- Name: idx_tickets_priority; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_priority ON public.tickets USING btree (priority);


--
-- Name: idx_tickets_source; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_source ON public.tickets USING btree (source_type, source_id);


--
-- Name: idx_tickets_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_status ON public.tickets USING btree (status);


--
-- Name: idx_tickets_status_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tickets_status_created_at ON public.tickets USING btree (status, created_at);


--
-- Name: idx_users_role_active; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_role_active ON public.users USING btree (role, active);


--
-- Name: idx_users_role_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_users_role_status ON public.users USING btree (role, status);


--
-- Name: idx_whatsapp_chats_assigned_advisor_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_whatsapp_chats_assigned_advisor_id ON public.whatsapp_chats USING btree (assigned_advisor_id);


--
-- Name: idx_whatsapp_chats_assigned_advisor_id_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_whatsapp_chats_assigned_advisor_id_status ON public.whatsapp_chats USING btree (assigned_advisor_id, status);


--
-- Name: idx_whatsapp_chats_fixed_advisor_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_whatsapp_chats_fixed_advisor_id ON public.whatsapp_chats USING btree (fixed_advisor_id);


--
-- Name: idx_whatsapp_chats_jid_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX idx_whatsapp_chats_jid_unique ON public.whatsapp_chats USING btree (jid) WHERE (jid IS NOT NULL);


--
-- Name: idx_whatsapp_chats_operational_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_whatsapp_chats_operational_status ON public.whatsapp_chats USING btree (operational_status);


--
-- Name: idx_whatsapp_chats_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_whatsapp_chats_status ON public.whatsapp_chats USING btree (status);


--
-- Name: idx_whatsapp_messages_chat_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_whatsapp_messages_chat_id ON public.whatsapp_messages USING btree (chat_id);


--
-- Name: idx_whatsapp_messages_chat_id_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_whatsapp_messages_chat_id_created_at ON public.whatsapp_messages USING btree (chat_id, created_at);


--
-- Name: ratings FK_257f863abdd600165060462eb40; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.ratings
    ADD CONSTRAINT "FK_257f863abdd600165060462eb40" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- Name: whatsapp_messages FK_273d77bd2645b7219d79bdabe9d; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT "FK_273d77bd2645b7219d79bdabe9d" FOREIGN KEY (advisor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: whatsapp_messages FK_4cdcb5c2cb0917274782b6d68f4; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_messages
    ADD CONSTRAINT "FK_4cdcb5c2cb0917274782b6d68f4" FOREIGN KEY (chat_id) REFERENCES public.whatsapp_chats(id) ON DELETE CASCADE;


--
-- Name: comunicados FK_62ab35fdb4b1d2a5e062c6ce1bf; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comunicados
    ADD CONSTRAINT "FK_62ab35fdb4b1d2a5e062c6ce1bf" FOREIGN KEY (sender_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tickets FK_7389e8f52d49d5f3a9deef02a3d; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT "FK_7389e8f52d49d5f3a9deef02a3d" FOREIGN KEY (closed_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: whatsapp_chats FK_98983de080e2048693596359373; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_chats
    ADD CONSTRAINT "FK_98983de080e2048693596359373" FOREIGN KEY (fixed_advisor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: comunicado_eventos FK_a26a191a175db1abada225bb32d; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.comunicado_eventos
    ADD CONSTRAINT "FK_a26a191a175db1abada225bb32d" FOREIGN KEY (comunicado_id) REFERENCES public.comunicados(id) ON DELETE CASCADE;


--
-- Name: tickets FK_b564a18159530b5a56aeac33d1a; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT "FK_b564a18159530b5a56aeac33d1a" FOREIGN KEY (assigned_to_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: sessions FK_d24c3fc63950e4cb6c140855fd6; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.sessions
    ADD CONSTRAINT "FK_d24c3fc63950e4cb6c140855fd6" FOREIGN KEY (advisor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: whatsapp_chats FK_e89b3f53d657e3500d7a5a02276; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.whatsapp_chats
    ADD CONSTRAINT "FK_e89b3f53d657e3500d7a5a02276" FOREIGN KEY (assigned_advisor_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: tickets FK_f131b2269095005a89841a11e4a; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tickets
    ADD CONSTRAINT "FK_f131b2269095005a89841a11e4a" FOREIGN KEY (created_by_id) REFERENCES public.users(id) ON DELETE SET NULL;


--
-- Name: messages FK_ff71b7760071ed9caba7f02beb4; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.messages
    ADD CONSTRAINT "FK_ff71b7760071ed9caba7f02beb4" FOREIGN KEY (session_id) REFERENCES public.sessions(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict 9XsKpavzFfQ3MfESfk8CRo6YCDe6xuyRbXVFoh4gdhFufLC3Z2LdbiLeMV26w9q

