
--
-- PostgreSQL database dump
--

\restrict KWLzzJi1d2QJclJv6vUC0ZpKboSbtwGF8nPLWnAd8NGp8ApzgYDP4EZ6egYbcBg

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
SET timezone = 'America/Bogota';

--
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


--
-- Name: vector; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public;


--
-- Name: EXTENSION vector; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION vector IS 'vector data type and ivfflat and hnsw access methods';


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
    whatsapp_quick_replies jsonb DEFAULT '[{"name": "Saludo", "content": "Hola, con gusto reviso tu caso."}, {"name": "Espera", "content": "Dame un momento mientras valido la informacion."}, {"name": "Despedida", "content": "Quedo atento si necesitas algo mas."}]'::jsonb NOT NULL,
    almuerzos jsonb DEFAULT '[]'::jsonb NOT NULL,
    ticket_categories jsonb DEFAULT '["Soporte tecnico", "Administrativo", "Academico", "Facturacion", "Otro"]'::jsonb NOT NULL,
    sonido_activado boolean DEFAULT true NOT NULL,
    sonido_whatsapp character varying(30) DEFAULT 'whatsapp1'::character varying NOT NULL,
    sonido_asesor character varying(30) DEFAULT 'asesor1'::character varying NOT NULL,
    sonido_cliente character varying(30) DEFAULT 'cliente1'::character varying NOT NULL,
    sonido_asignacion character varying(30) DEFAULT 'asignacion1'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now() NOT NULL,
    updated_at timestamp without time zone DEFAULT now() NOT NULL,
    ai_prompt_config jsonb
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
    profile_photo_url character varying(500),
    refresh_token character varying(500)
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
    priority character varying(20) DEFAULT 'normal'::character varying NOT NULL,
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
    mensaje_burbuja character varying(150) DEFAULT '┬┐Necesitas ayuda? ┬íChatea con nosotros!'::character varying NOT NULL,
    mostrar_burbuja boolean DEFAULT true NOT NULL,
    titulo_panel character varying(100) DEFAULT 'Soporte en l├¡nea'::character varying NOT NULL,
    subtitulo_panel character varying(150) DEFAULT 'Estamos aqu├¡ para ayudarte'::character varying NOT NULL,
    chat_url character varying(255) DEFAULT 'https://ia.innovacloud.co'::character varying NOT NULL,
    chat_header_color character varying(20) DEFAULT '#1a1a1a'::character varying NOT NULL,
    chat_bg_color character varying(20) DEFAULT '#f0ede9'::character varying NOT NULL,
    chat_bubble_color character varying(20) DEFAULT '#ffffff'::character varying NOT NULL,
    chat_bubble_user_color character varying(20) DEFAULT '#1a1a1a'::character varying NOT NULL,
    chat_marca character varying(80) DEFAULT 'Soporte en l├¡nea'::character varying NOT NULL,
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
95fb63b6-2622-4efb-b7b4-a70b7c80233e	Innovacloud	https://innovacloud.co	info@innovacloud.co
0751a31c-abf7-4c13-9f3a-e4203b466989	Colegio General	#	
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

COPY public.configuracion (id, advisor_id, mensaje_bienvenida, asesor_inactividad_seg, asesor_inactividad_msg, cliente_inactividad_seg, cliente_inactividad_msg, cliente_inactividad_iters, cliente_cierre_msg, horarios, horario_fuera_msg, horarios_activos, whatsapp_assignment_msg, whatsapp_queue_msg, whatsapp_out_of_hours_msg, whatsapp_call_unavailable_msg, whatsapp_quick_replies, almuerzos, ticket_categories, sonido_activado, sonido_whatsapp, sonido_asesor, sonido_cliente, sonido_asignacion, created_at, updated_at, ai_prompt_config) FROM stdin;
54a7db82-d2a7-4ac9-9de7-4318b7305d0a	\N	┬íBienvenido! ┬┐En qu├® puedo ayudarte?	120	El asesor se ha desconectado. En breve lo atender├í otro.	180	┬┐Sigues ah├¡? Escribe algo para continuar.	2	Gracias por contactarnos. Que tengas un buen d├¡a.	[{"dia": 1, "fin": "21:10", "inicio": "08:00"}]	Estamos fuera del horario de atenci├│n. Vuelve en nuestro horario habitual.	f	Hola, soy {{asesor}}. Ya fui asignado a tu conversacion y revisare tu caso.	Te encuentras en cola. En breves momentos un asesor se comunicara contigo.	Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.	Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.	[]	[]	["Soporte tecnico", "Administrativo", "Academico", "Facturacion", "Otro"]	t	whatsapp1	asesor1	fuerte	asignacion1	2026-07-13 16:53:21.019367	2026-07-21 12:46:40.39268	{"roles": {"padre": {"descripcion": "Tienes acceso a informaci├│n acad├®mica y de pagos de tu hijo.", "temasRestringidos": [], "mensajeRestringido": ""}, "docente": {"descripcion": "Tienes acceso a informaci├│n acad├®mica y administrativa.", "temasRestringidos": [], "mensajeRestringido": ""}, "estudiante": {"descripcion": "Tienes acceso a informaci├│n acad├®mica y personal.", "temasRestringidos": [], "mensajeRestringido": ""}, "administrador": {"descripcion": "Tienes acceso completo a toda la informaci├│n del sistema.", "temasRestringidos": [], "mensajeRestringido": ""}}, "especialidad": "colegios", "nombreAsistente": "asistente virtual de atenci├│n al cliente", "feedbackPositivo": "", "frasesTransferencia": ["asesor", "humano", "persona", "agente", "perro", "gato", "arroz", "quiero un perro"], "promptPersonalizado": null, "instruccionesGenerales": ""}
0467378e-27c2-451c-b2b9-0e206477cfff	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be	┬íBienvenido! ┬┐En qu├® puedo ayudarte?	120	El asesor se ha desconectado. En breve lo atender├í otro.	180	┬┐Sigues ah├¡? Escribe algo para continuar.	2	Gracias por contactarnos. Que tengas un buen d├¡a.	[{"dia": 1, "fin": "21:10", "inicio": "08:00"}]	Estamos fuera del horario de atenci├│n. Vuelve en nuestro horario habitual.	t	Hola, soy {{asesor}}. Ya fui asignado a tu conversacion y revisare tu caso.	Te encuentras en cola. En breves momentos un asesor se comunicara contigo.	Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.	Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.	[{"name": "Quedo atento si necesitas algo mas.", "content": "Quedo atento si necesitas algo mas. [LINK](https://github.com/settings/tokens/4868547805/regenerate)"}, {"name": "qwewqeqwe", "content": "qwewqwe [asdasd](https://controlacademic.com.co/)"}]	[]	["Soporte tecnico", "Administrativo", "Academico", "Facturacion", "Otro"]	t	whatsapp1	asesor1	cliente1	asignacion1	2026-07-13 16:53:21.2	2026-07-14 20:11:25.840304	\N
a233f7e7-e16d-4d4b-ba2d-d5437e471af1	\N	┬íBienvenido! ┬┐En qu├® puedo ayudarte?	120	El asesor se ha desconectado. En breve lo atender├í otro.	180	┬┐Sigues ah├¡? Escribe algo para continuar.	2	Gracias por contactarnos. Que tengas un buen d├¡a.	[{"dia": 1, "fin": "21:10", "inicio": "08:00"}]	Estamos fuera del horario de atenci├│n. Vuelve en nuestro horario habitual.	f	Hola, soy {{asesor}}. Ya fui asignado a tu conversacion y revisare tu caso.	Te encuentras en cola. En breves momentos un asesor se comunicara contigo.	Hola. En este momento estamos fuera de servicio. Por favor vuelve {{proximaApertura}}.	Actualmente no estamos disponibles para llamadas. Por favor escribenos por este chat y un asesor te atendera.	[]	[]	["Soporte tecnico", "Administrativo", "Academico", "Facturacion", "Otro"]	t	whatsapp1	asesor1	fuerte	asignacion1	2026-07-13 16:53:21.200978	2026-07-17 20:51:47.551207	{"roles": {"padre": {"descripcion": "Tienes acceso a informaci├│n acad├®mica y de pagos de tu hijo.", "temasRestringidos": [], "mensajeRestringido": ""}, "docente": {"descripcion": "Tienes acceso a informaci├│n acad├®mica y administrativa.", "temasRestringidos": [], "mensajeRestringido": ""}, "estudiante": {"descripcion": "Tienes acceso a informaci├│n acad├®mica y personal.", "temasRestringidos": [], "mensajeRestringido": ""}, "administrador": {"descripcion": "Tienes acceso completo a toda la informaci├│n del sistema.", "temasRestringidos": [], "mensajeRestringido": ""}}, "especialidad": "colegios", "nombreAsistente": "asistente virtual de atenci├│n al cliente", "feedbackPositivo": "", "frasesTransferencia": ["asesor", "humano", "persona", "agente"], "promptPersonalizado": null, "instruccionesGenerales": ""}
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
1	┬┐C├│mo puedo contactar a un asesor?	Puedes contactar a un asesor a trav├®s de nuestro chat en l├¡nea. Solo escribe tu consulta y un asesor te atender├í a la brevedad.	General	contactar,asesor,ayuda,humano	\N	1	t	2026-07-13 16:53:21.226215	2026-07-13 16:53:21.226215
2	┬┐Cu├íl es el horario de atenci├│n?	Nuestro horario de atenci├│n es de lunes a viernes de 8:00 a 17:00.	General	horario,atencion,horas	\N	2	t	2026-07-13 16:53:21.226215	2026-07-13 16:53:21.226215
3	┬┐C├│mo puedo crear un ticket de soporte?	Durante tu conversaci├│n con un asesor, puedes solicitar la creaci├│n de un ticket para dar seguimiento a tu caso de manera m├ís estructurada.	Soporte	ticket,soporte,caso,seguimiento	\N	3	t	2026-07-13 16:53:21.226215	2026-07-13 16:53:21.226215
\.


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.messages (id, content, sender_type, sender_name, created_at, read_at, session_id) FROM stdin;
d4f21683-5949-40f8-92a0-7fca657f6367	enc:v2:9EADvrNLR3PZaEhX0SNxGTq07BUZXF8zJS9p/biMTBc=:nlYekGJ1MnfnQDiL:+lsxMBkHTkVz8kow2pf/dw==:LgOWRX3/evYin/PZp85HUMZLYC1u8pqQ/qrH3Y+IlBKBdl7wFJM6	advisor	enc:v2:7rRVF29rKRMiJY8GpXCsJqLh1sgjKBzzUOQ50W5pGP0=:+LS9kPS9ESSv9hQX:naFuxRoxYSsVgI8EvlxaIg==:QEM/GjXaJg9iO4zT	2026-07-13 17:55:18.196798	2026-07-13 12:55:18.301	945ff1eb-461a-47f4-959e-7f5e0ee6838a
93632e30-4a44-4a22-bed1-d4b92bc02ff3	enc:v2:gihtAKNygKIJ2NtLApZXmYtKXDnxUy/0TlM3ZSrfShM=:Tt2WuxxU03blKZlK:95V8RTSiJ5JvhKw6IRTlmA==:XByCmyfTbwdU8xEINDzRPuyBJG5ME2x18d/4N+58WIm6whmakgvGcznBew==	advisor	enc:v2:Eo9W3rjSC0Q+/irx8K3aRuSa0mzR1MbqstcKi+gtkx8=:mBXIR3hMs6N0BT7O:GHrqvQ3ip3BmKxLkM0BwyQ==:Q6J0nSnAEA==	2026-07-13 17:58:18.412263	2026-07-13 12:58:18.45	945ff1eb-461a-47f4-959e-7f5e0ee6838a
1d14d115-644a-405f-9d45-3fbfc3a4dc29	enc:v2:SnbddD/ELw7PAe3Nl4Hvj3M+z8hlKg7uXBA0USRYa94=:qbwHOQgeiGiHCTfG:h9gqGJOom/f4w8mDWlOuUA==:26yYlEkV15sRVj8vYzME4/PcHbMvKDw3/yXAvKJtCZbEo+EzagahUhX5aA==	advisor	enc:v2:plQn0hub0sPYjxCNV8uhvFa2CHQh0BLJfxFqL2tVQtI=:erNsjV8k4tpog8Bn:4vSp5V5xlYuyGfw4wlw1CQ==:NnWR5LWVFA==	2026-07-13 18:01:18.525682	2026-07-13 13:01:18.569	945ff1eb-461a-47f4-959e-7f5e0ee6838a
f2558da5-e931-4e19-8136-7ac6769f9e94	enc:v2:4Q8GU1wCETlqnknWBg2DSFGUWcY9STfFn+uUMjRRfok=:b4WZXFIaEVhVzcx0:ki+9qYvUcsDqICnpzPrhmA==:rMyeui3kHkLzKOoazwGiJCIgevgkQYXEQN1DpEFBKItULLkv09me	advisor	enc:v2:keTHgeftZ6bjA0kdFj+bi6ln47tXGu1u3hFkMDlLlds=:/08gZqjH0kCCbnVX:YdH3/nV32JMTFDdwKCQO9w==:QYZm7p2mPIqzft75	2026-07-13 18:09:42.031426	2026-07-13 13:09:42.323	0b8989e5-0447-48cd-b3dc-f6c5320c26d4
8d01eba0-dd30-4bf5-98e2-3334d314e212	enc:v2:rFAeGdXpuju1a87gmY1lcjPXjdScAwwjrF7mMwbaI8c=:NEgd6Y7DYroBsoXl:HHU9Mk1eG62T6mIXa/h73w==:Mvxl	advisor	enc:v2:5UfMcaI67gtvx7SfcWlbqE5K7ekgiLiLR0zhEhpt7vE=:0Z9ynFBWommo+BFE:4MBeIIwvTdqdSGKqaf55Eg==:PGPhveBOPKsQdiw2	2026-07-13 18:09:44.955206	2026-07-13 13:09:45.011	0b8989e5-0447-48cd-b3dc-f6c5320c26d4
c36fc1ef-4db4-4a72-afb3-4d4681b320ad	enc:v2:1g5gKDSE2DOq4kEfVZT9f5FukPGeJt9Pb+5nw7rfAsk=:s6MOkW0q7wlqbVy6:jCAd/ZPhZiWUOnNORMpVBw==:SqKPQhs=	advisor	enc:v2:z2FIsBvjSVKt9vOty/e7eTUxacziTysdaAWPcHRj9D8=:icLxakJOAIWogWoN:WkwHt9sWAuQxjHpn0GTmog==:yDvHjpQ77FzDeoaY	2026-07-13 18:09:46.753064	2026-07-13 13:09:46.797	0b8989e5-0447-48cd-b3dc-f6c5320c26d4
9a62ad4e-7a7e-4b67-92c5-cc9eea1711ab	enc:v2:HeQ5Whf9FRasL2yG8qGXOofnhbD5geXgX5xiwHw12is=:ZS4tmCTiUKaDkzPF:FsegSsj/8WJ4tKEAtXnuVw==:1X7jSGekHQ==	advisor	enc:v2:3qGLtsjtf1q9r6VKyo4yL5MoR4haWAlg2+9WSj93EzI=:YphyH2eNzlJuIdUh:SHI6/xoxaBmUsGWny0/jyg==:GheVn4TuTjj8oXXo	2026-07-13 18:09:49.404994	2026-07-13 13:09:49.458	0b8989e5-0447-48cd-b3dc-f6c5320c26d4
669037b9-9399-49aa-adc3-e293cb39186a	enc:v2:fybRvsbH/jwZaov7s8jt+T8++WD/OEftq/TTeJt0GHQ=:Ijje4iLVz4rbgEg0:c9i/rtn6J/AcMbK//983/Q==:Ro1l6VWg80Qaq1BgBxsPYAUrrWiyQ0U516RcLKeKLvRNtJcpK7mc1R63FA==	advisor	enc:v2:mOWnUnjuxfIObXzwvhUGM3O0x4dwM7a6dfmyVERW3Nk=:QehPIyNLtKh8l0M4:MkkocpLFr20b5yvrDXs+KQ==:MZRnTZXOgQ==	2026-07-13 18:12:49.516117	2026-07-13 13:12:49.562	0b8989e5-0447-48cd-b3dc-f6c5320c26d4
72d42941-be82-4a6c-aa41-0533684f5637	enc:v2:FdNL2/Ei1y6qaesYvU9yj6uGDl8hs9V/0j47DxUXBqk=:7G1XMYElAgxJygwc:a1afY1XEblVptV31b10rPw==:nnSU6VSoBVDa9aWsX7d9bLaeJZpSXUI0Do4q9smqM7DkDZSLCClC2rlpZg==	advisor	enc:v2:NmqswySnRmu6vg6N72vLDt/jMervXYCsjpTegEZhfmQ=:SwOesEIhU5xN8IBP:yJhSvypYiwB40GsJtTYIjg==:kQBy0EbSSw==	2026-07-13 18:15:49.615095	2026-07-13 13:15:49.662	0b8989e5-0447-48cd-b3dc-f6c5320c26d4
6da3a540-0d71-4af6-9542-6eb561835b53	enc:v2:yBmF8xXYAiD8F9c5xG3OjxjXWWTyrldukgKmug8edIk=:Vt6L+UYE4D9yU1bH:FIIoS2tu52cyyZizHw6xsQ==:X9HGFp4eTCbuYtI3jJTJmARhRpIfTMCxIyibHMxcKX6j1nKTexs+2GDhr/oJpNghrrU=	advisor	enc:v2:LnscXM6YKr3EKr3jLOXxbyUfz4zRYlhQzaoWZhG8KU0=:B0Mecc2vJXyZAaab:uUXrSGhFhyrTHXyxNDcR/g==:aaNy00m1Ww==	2026-07-13 18:18:49.724798	2026-07-13 13:18:49.768	0b8989e5-0447-48cd-b3dc-f6c5320c26d4
66dc5aec-e277-43e9-a78a-28766d9b5bf8	enc:v2:a6Kp3zkV4t2ZiIpCU4XuLs5+j6V5aQLFpEMzZCJsGZY=:6Ww4DJW8DleM27VD:JBOd+lNBrK6jpB8/un9FHg==:fY2j4L0rnIgT55O7QfmSIvBeGDm9k6WOhPVcn73CaZqm3rqCMd9l	advisor	enc:v2:8SJRME2+AAZ5y1MRhbAMDLGs2Qb5Uf22Pn+d1yhD/tU=:rvYJezDQxVg6uXeF:qZTa2gHud/KdfM/Z2dtzFA==:LsZHGb3EJqHQywT9	2026-07-13 18:23:30.247421	2026-07-13 13:23:30.474	bb401dd0-4d7d-46c5-a9ee-4fbe00a4c4fa
f0409ba9-50fe-4158-a5ca-69b9dbebcb64	enc:v2:/sTkteB/m7JP70N7x6D0ca7VgcpYty3Sa5yAWvpo4Tk=:ldb7xUe1uAZWmvwW:GbXzPQlVwf65RatT+21EQQ==:Qa13KW0I	advisor	enc:v2:MIYS3/Ov2huFhHD+Mva8WA3QaR/QjmxYY8j8gnqMs24=:hN8fxobbOWRmKxJ7:q01GNp7l8YnRsUDFxejQUw==:sa98VCkHbEBXHOtp	2026-07-13 18:24:11.546056	2026-07-13 13:24:11.603	bb401dd0-4d7d-46c5-a9ee-4fbe00a4c4fa
861fdab8-6f33-4130-9949-d3320c97e631	enc:v2:4UsjuH4frIYknnUh04Ewgj1WMHWV48tpUJQFoKSlJHc=:o5+NSvsJ+Gt2Xmzp:/yMRG+pi6l1C9V3IvMNOQQ==:KLXQVaPkieikF8GZJlgUJAmGCpJDj3RJ26qVtLBsp7+annhNwKHK1tHtVw==	advisor	enc:v2:SAl/BdLAFkJAIuyBEw8NQjlBSN8oHzNmO12fhSc8wHU=:c2mXgnv9VdAD5GgN:QNOSPabrs7oHW8THshvf2w==:8Q50tkWONw==	2026-07-13 18:27:11.663908	2026-07-13 13:27:11.699	bb401dd0-4d7d-46c5-a9ee-4fbe00a4c4fa
a75962d6-4fc1-4989-9625-811c7a7ed35f	enc:v2:UTMN4T98nJdGMn1ugULnmg/7Aw1SFM5VefkhSkXJ/YQ=:C+Qie2ncMt8pO0Qa:wvCMMs4rT1XPNOFeLFm3dg==:w/IKHaCf0r6rebGF3dSGk1Cv2z7Udd64J4cdJ07LI0Ub1L4UkFGIyVZUoQ==	advisor	enc:v2:/hbr1skQ4M3O9iJHS6AD+yoxcdmhz5mvnVSwXoPBX34=:DpnF4fWhbBOMxTbn:gET5hVwaJ8HlC3rR5d05PA==:YSb2BbHH5Q==	2026-07-13 18:30:11.758394	2026-07-13 13:30:11.794	bb401dd0-4d7d-46c5-a9ee-4fbe00a4c4fa
174ebb85-d10f-4de4-8b7f-b72edcbaf186	enc:v2:DyprvP4LGcwwquqn5QSmwUTHPmEDAoUnH14IHLxTxsY=:HW3UwbcpFdiJM1VN:s0/ErdRIiXnWB1n1j7/T5Q==:ccNNzbCvDAelMbF0R0MfrcesXbgRrlNpsegi67zMFuiXPQH6tXI26WF+sgpzo3tKDNw=	advisor	enc:v2:fU0E2Ba9Lp6Mrn32uC8a4AAxK76DhDPONT41KGcjDqY=:3MoU+w8jty+w3mft:l5+EL9U5r737HmDEeKX79A==:Vtr8wuVEDQ==	2026-07-13 18:33:11.851597	2026-07-13 13:33:11.896	bb401dd0-4d7d-46c5-a9ee-4fbe00a4c4fa
d16c6d0c-c18a-4ce0-a7b7-420623b9ba08	enc:v2:biuB6HC3qmUbxRvH3OP7TFhVPGBZJeNmOtvBS8+jeKk=:jX3uU23elzbio20X:WIaLfbL13tR74ZXv5bMAKg==:sWG3sIjNM4wbPGsinOZG7BxCEjwp4/JPrpC7L0DQ4AgmyoNq+kLn	advisor	enc:v2:JiMvneah0WYgiCamExlmsaYBu4aYDXCk6hVRgeEtMyg=:NSG9cuBnDyuWbrMJ:9ydLh4nrDUNnHPMHqhfIgw==:bhYt2D48N90GXgL8	2026-07-13 18:48:53.278523	2026-07-13 13:48:53.564	60d50d0c-b993-4259-8e3b-ce25c4189850
090666ab-831c-40a6-bdb9-8ab5a9c4e05a	enc:v2:avP987VKbXoZ+UxHN0yQz/5Doz8wDjqrC+sTv3y/IKE=:y5T8P2QcKSsvNksF:pd8IQ7m+GJv+yYdxFRnPgw==:Rh5CPp/OqWKH	client	enc:v2:EN5BmppbUt8GmJbMb9jZQluJ7GzHQW/pvlcHyzJOTVU=:QEnIn1xw7rS0HaDA:MhSZX/ZlM6iRDtXLB2Uprw==:MAhOUFFZ	2026-07-13 18:48:57.902052	2026-07-13 13:48:57.947	60d50d0c-b993-4259-8e3b-ce25c4189850
85f3d04f-f8cc-42a4-8e10-cf971b15156b	enc:v2:O5Q2LnJ2t/4EbqGWhVgx9KZQsda+Q7jQk8w0mv1OUvQ=:jPXom8KyX7jKHrER:7i6IowR2LPsssLHVVxwRHg==:s/R+anHXMAIHxXF+Dg9htkQFEIYAF+LboE1uWMudcsggCF0=	advisor	enc:v2:ctTl/B2v9hV7bhSKqpWOZVe/m+fM22KMgB5B3dEZ9co=:58+dzQ9GwPP1A/Au:TUVUr/DVVu/UAgO3CJYxqg==:XuEWRA/lRvAU1glO	2026-07-13 18:49:04.476603	2026-07-13 13:49:04.531	60d50d0c-b993-4259-8e3b-ce25c4189850
e4c56ab0-89c2-4d57-a4e4-e06796317096	enc:v2:1gXp4E+upf8TMbwqNS9fqXW1MvxpLcj6kKZ7mr1H+2c=:KZAD333SR5asdsIS:QTv+hHMZAW11zsRWq9OXHw==:PEEsDjnK6qJrxCQVe8niJp+FeIdParJedPvkudey5A==	advisor	enc:v2:PGlHlCEarGXNU3VC6mV4PIOTi9sggxnohs40kLQZjgQ=:GoKcQSTMByhfCYTU:GNgxnOWfdCddNJnXtkzBcg==:VxNhYi9737qnYTxg	2026-07-13 18:49:09.840765	2026-07-13 13:49:09.887	60d50d0c-b993-4259-8e3b-ce25c4189850
c3a08d00-0455-4b7e-b8a7-88abe01381e5	enc:v2:oKQGJu1PArbNUQyZ4I3q+W65sfzJx3Im6IL7gqtd4LY=:jplV0QW3K2fJ2Alc:l6S02h5x2z9maJm/8TUCbw==:j+kgZQ==	advisor	enc:v2:C38c+YbuKzDo9TvL58E6ogXLTwMbxIHlif54nLeP0Y4=:gJQrnk8y/mE9JwMX:vpksptlq7/fXTACUkt5/1Q==:7GcOYTjAz5EKiu51	2026-07-13 18:49:58.020275	2026-07-13 13:49:58.071	60d50d0c-b993-4259-8e3b-ce25c4189850
e7764090-724f-4dfa-8060-707453f32737	enc:v2:zFJH7oVERjb7qx2HsotaNz5GEePl89d9PmkApf3X9/A=:wgiXda0X7p84Ugkq:ZBDOVM6+XY5i/mYrG3k9mg==:vz+MV1jSaIrsqovvMKXnWp+VTqIpbis8dwgoskropeRont59Y5oy14u2dQ==	advisor	enc:v2:wFtA7DshQBwtxU2Aw+WwSpZmsY3UpFo5lY7MOr0EK/8=:S21qUSc/QDZtMR7I:x9QtifTiPCM8eIchtP6Wdw==:4mlrlz+F+A==	2026-07-13 18:52:58.140176	2026-07-13 13:52:58.213	60d50d0c-b993-4259-8e3b-ce25c4189850
1c0dc5a9-d658-448e-9dab-a16500b06226	enc:v2:0djqtRjGOcshFJ8LwE9cIMhcPqvIBom1qN6EAWQpJtU=:7YWxeORAzuHdT26t:6pw0jfo3r0bFuFIDSM8ZDQ==:3LPT/9bUJZdMG8zIVx4Uu60SBnfHtOWpPrRumepTz3gSXqYigftU	advisor	enc:v2:CnMz7pfMqxqnem4nw1jdjTX4omEuor+Mu4ambn4gyFI=:m+cqtQzZvtPukZ3V:Dov/HUKfJkxoP5L2JJcAyQ==:nMpzFrh+6wRjoOCv	2026-07-13 19:00:03.809962	2026-07-13 14:00:03.803	d756b6ac-7c05-4ea1-8203-7547b6601b96
25f03ebc-d22b-4ff2-b18b-780e74021228	enc:v2:Nd7gwS+xVAiBYOSwOiFO60Ms9krdUQvUdeaz42R1Bpw=:TNT2IWnKuPkUum7N:uQnFvvZ0VbCuUzIq+jf7ag==:TlJ6c34BRUMZ	client	enc:v2:Y+s35mwIObX2MX3QTZEGHD8Qsy78CDOZsp4UFiNgrYg=:Pdw97VNsvzknRtP0:qBaBEhFvC1hlMUuHtDcxXw==:yR4R	2026-07-21 13:19:07.329444	2026-07-21 08:19:07.367	b4f207c5-9ad5-4e14-9b91-3c433b5c7e38
4d077a96-ce96-4ea1-9af3-1b3e8966b5c3	enc:v2:IB1U+iyhiLzYyxS9Wrgf1BH6e6OnUjsMkBC38s+Dr2c=:hJevEWWL/Qq/zNRC:dBliIB+Z2CHr8RPsYInXEA==:i08Bp7aG8WD0	advisor	enc:v2:BJ1wUJ+sKSwd6WplLcX1zl3QyreNDdVr6Kezah6IcqI=:BDMnYXe72XQEzkrg:YKPTg6klLctG8hpNj1YDUA==:9/t5nB+0bgrZwUwE	2026-07-21 13:19:09.189974	2026-07-21 08:19:09.24	b4f207c5-9ad5-4e14-9b91-3c433b5c7e38
90217af3-18e3-4209-96ad-dab81451ffa3	enc:v2:zPML772VjnVCeUXbNJ88dZTP0EZ6AdHSabR3g+kZbnA=:baaVVGbc3snU7Ig5:yEfTrqg45RzrP6IGmCphTA==:9yhrajpfxBHCwj2qDa51UurHUYfSJeV7YNct6sjmX4dioaDcbr8YwpoXSBgVj1tClKD5lYtZb5wUnZz9akxrExc0a5MM	advisor	enc:v2:Z1BTv0sTcOaFi/0mNMVPcW24DPps/ZTV6MIZ23+LnRc=:AtJsawNnenN0hKbJ:lO1ib02ouI6gXqt+Hyh2bg==:cxsdQYfDXtP0Zc6R	2026-07-13 19:00:29.218326	2026-07-13 14:00:29.273	d756b6ac-7c05-4ea1-8203-7547b6601b96
fef7e218-de69-4e1d-ab4f-85d91d126df3	enc:v2:CJ61XPtFahT6pKqPP41I7BD3tqGDHKEp8n8BN43iks4=:No8/cryHxw8C3jA2:JrJXBBi3VpyG6MGKh9xx2Q==:N5aOi8R9jgDHaQBOC0WO4Z+95RpHwSVjspGd4V8CPxEJg3wuk1dP	advisor	enc:v2:dnUSgYodTKEpt1RspdWIT8md2LloFDLXhJ0gxnOmJdQ=:9Fxwi+X9STBRkSOU:MssMfwpALQmJzA5xgkdl9A==:m3Ae2SewMA+9Ehfc	2026-07-14 20:12:00.6389	2026-07-14 15:12:01.215	357fd151-977a-43af-a29c-641e4b8cee25
8c30f12a-ae25-4159-8d31-42307d8e3bff	enc:v2:b6P12EF1bSqG/CLPcVuudvHGHYQ7WnblGx4RS5yhedI=:cv1MzrYwVPDeDXwk:xgs4oU6zU30ixl37SkVOhg==:dvv0GVJC	advisor	enc:v2:fk2SX6bTW2ToUcWNsqLT2oUXZwp92oPsdKJZ80VlkPA=:MUC6RWrUi/rS3GF0:bmACMwnlXXu5tn8OcWDnqg==:sqhw3TTtpUqtBkxB	2026-07-14 20:12:05.0992	2026-07-14 15:12:05.155	357fd151-977a-43af-a29c-641e4b8cee25
28fa865e-6d2c-4e07-b063-9b45f763c0c7	enc:v2:xuKqVjXJ8rYMq92IB6i3Fog0v03HYNIXP+Qi/t++Yj0=:XOxkTPJBs7ZBejDi:Tcj+nXv9dI89zsfBUorkrQ==:qMgU0Iw=	advisor	enc:v2:Nsn2r8mapbHrJKhU+vfSvHjuCVGDXKsuTT3Kuq88vjQ=:Cw4Oa/ic2kpXgbX5:GpLtyP0SW+PClIYY9KuM/w==:Z6LPKl0vApezOi04	2026-07-14 20:12:06.800227	2026-07-14 15:12:06.854	357fd151-977a-43af-a29c-641e4b8cee25
da723cc6-01c8-40cf-957e-1b828086a31b	enc:v2:/Elt70Geip740Sn6JUTGACP0Z1pGVyN0OKp/xS4rzIk=:dxCR1a5tpyVt69Ah:NzIAHZkW2l9WjwQimLq31Q==:kgFMBkIeQydeqmUEAQcXGi0gyCowmduF+u+lj+KKB2DAjnW15HcaLEIbDw==	advisor	enc:v2:m1OY0d0C6XQmmvkUkCxAuPJyeK6Dd4u/meaBk4vybPA=:Ae9smH+w5QdmTEPw:Aa5sgi+ZGanE7DW7mz5PsA==:PXBD1Etb8w==	2026-07-14 20:15:06.910889	2026-07-14 15:15:06.961	357fd151-977a-43af-a29c-641e4b8cee25
49dbcf91-5a5e-482c-8b8e-c8f644857be2	enc:v2:iu/cw1oz7uOzU+LcgCwRHF+MEjQI5O3lclfmzsvnf30=:Zl5gZP0OEdtGjU+R:x/UmE4fZbn6gOKMrZIsZ+A==:afROoYvC8SrMuGVZgWVbU6meAGqlL2jUeWoakoMnhM44FoZvVd8AmGty8QkyWvs=	advisor	enc:v2:KQ0ADY/96lvdcpcOxYK8+0Qv80fXLUhGXot//3m17AQ=:cwBanVhdq/mFYcrb:gGlEXSN8ssh24/Hgtl2TOg==:0ZqbdLhwvCtwTRFR	2026-07-14 20:15:36.981961	2026-07-14 15:15:37.043	357fd151-977a-43af-a29c-641e4b8cee25
5fb7fd34-c6ea-48bc-bdff-2e31dbc7e163	enc:v2:SMNmyLhlsvFBUwainqSiGpEWwjF6uyd0trsZwqOMyIs=:6iQ6Ox53aJfgcAZ/:+x3Ix9zxPhLzNLlerGYfew==:E4zW0psM2Wzq+lotvLwOY84mYrpTWzz8rwawzhs73/hWkRGFFSzF	advisor	enc:v2:fxPJyrKTo2HldvWin2kAuIakhhwyhBsRf8RLc9q4/dE=:DEKxUH0ZKSAgGJrt:CnrpZts1ENnxyVDLTh96Xg==:qLcTwmptbMelwY9B	2026-07-14 20:18:32.732572	2026-07-14 15:18:33.081	2bc1c379-8955-4d41-a623-45d0d0eab009
9a58da1b-bee1-41dc-bd25-197736b7f403	enc:v2:SghAx7R3Kvoet/F6fhTQtj2CIxaO1Y6VeNQl3BjzDFQ=:5lKHQEBrpO4JXGzV:37booKjt+Z0paXs5BxHJXg==:n1Qo/EXDT9Ap	advisor	enc:v2:iL+nV8dJcS1/UUMO2ScJXo0rdP1dA7oEf5HDXPHivaE=:OF+p7MOMSi4vNWQA:CD0VgRE/u9JCVxbDoJDRgQ==:MekyhTlc0Yr3s3tF	2026-07-14 20:18:37.688375	2026-07-14 15:18:37.734	2bc1c379-8955-4d41-a623-45d0d0eab009
bfa07058-b32d-4422-88ba-247cc325fb79	enc:v2:TBrX8fVq4qpF0GjlI5v0e+LdcNHP5kaqHtE+XPUsmug=:0CRJLT28fAsk8hBH:j0gpQ+XRjKFDt3RTf4GpZQ==:wI0B0shHRAZ4t4yn7yMKBZx0jMDwTWxJfSM2Xg1ge3p704g=	advisor	enc:v2:JLm9L9FPXLxGDsjPW+2DMeeco4bowhxS1gaOgDjjQoU=:Xti5QjbPYNAKZAKF:7V/iLaS/MOywnZMN3mVTsA==:F1s90Cuz/Nqrp5VM	2026-07-14 20:18:44.784529	2026-07-14 15:18:44.823	2bc1c379-8955-4d41-a623-45d0d0eab009
44fd32cd-d115-4073-8caf-6fc74f5431a5	enc:v2:jaJk0dAxqccGfHT7k3cR9pSD2AjYd97gox1g3+1iDX8=:5kRikoh/KIKBDQHT:ifltRNvasva3Uy2jHdA6Kw==:gXbb+Q==	advisor	enc:v2:3MqNQbenG+NKhC1kUYsUrF7cQ9w6I/gCXJBQm5qsLLY=:dkrSG5ktOvzBPTGh:ZniFBOO/yiJbc7aYtS6yng==:O7mIPbW1MmdnZpwG	2026-07-14 20:19:26.100729	2026-07-14 15:19:26.142	2bc1c379-8955-4d41-a623-45d0d0eab009
df94e571-1386-4772-8f4f-2e1a3cfa5ec9	enc:v2:0QIx1JytxCcuhoKdpJoYjzs8sNLbnUx0avL0FAIqWTo=:sj9KwLPUWOmlw2OK:xfoXHuNucobeFBG6aLTgLg==:M9hBQRDB00PEi2GOEplWRiJCd+7xhr4uxHZNkxM8fXvpfCPLgypL888qqg==	advisor	enc:v2:GO+sGqzFxudFoeGFYNozsB4DoZ2x8CiTAZ7tB/tdmeM=:FZUnOq+w0tv5BvbQ:DbJPQzdhx7PMr1SlCfiEAQ==:to+43CbleQ==	2026-07-14 20:22:26.199716	2026-07-14 15:22:26.248	2bc1c379-8955-4d41-a623-45d0d0eab009
5aaa3c16-8b5a-4140-9988-dbfa2b97ccf2	enc:v2:/onIO+FNetfxknf6lOffscuLbe3BWGmvwqxLTtKcevI=:S0YdQhKsvVY8oC26:tDlUBEkfFFItO7XyKTQtjg==:ALpJCqL6CKwEg00oNpEYwXumlTFaJ9WmcdjJP1xMEdZ36LLoKoJqPDui2w==	advisor	enc:v2:lX0Yl48rfOtcGwsmHB+qI+kXnduGDfFoSiQ77uilo90=:v2PSf6tMoFnlcWu+:0Rw2ogixlO/amdvqeubbBw==:EGC0I9kT1Q==	2026-07-14 20:25:26.304023	2026-07-14 15:25:26.343	2bc1c379-8955-4d41-a623-45d0d0eab009
230702e8-ecd7-45ea-a4ab-0e72fbfcab37	enc:v2:pj3nKICz2kzJBjhTxr8mhoRpkV3bthH6Av5s43DJF/w=:m8lrcBkW3vvqla2A:6W4gRv6RolR70uQ/xhEgtg==:T+ligNhc7yKTxHoLYBsv7IzmUQSyqQSC+ACo7Gvmdw5ux7sdIPQ8GRg5TSu8HMI60N0=	advisor	enc:v2:x24VgFnd2XMV5goz3kTA490WKLuHlZuBU0Zj3BT7T/I=:t0FcTLQ4l84ilTe1:Q1VuY913oNUQ7B8JUkaoLw==:9gHjF5WPQw==	2026-07-14 20:28:26.404025	2026-07-14 15:28:26.449	2bc1c379-8955-4d41-a623-45d0d0eab009
18779f6e-8f5f-45cb-8a50-cc067cb044aa	enc:v2:D/fjEWUZWs054yWRzdULItGPC7MHml2XqgGNiyfBGZ4=:I9wczQGyhjt1DOTC:+mw5XU9LPcWnOswCXuIDwg==:CfwpA4o02kg+xGQIdXYVp8X0aGb00miICejJMi1b2QBAZlDagrjl	advisor	enc:v2:kcWgTNmB8w2/BHVWX6/sDBxZekZiDIX+LEJ5GFRiHU4=:lAGejeXDcGmPVqLu:yDtLS6dBUsBWX1O3TBj13g==:u1mtOLSPl5Msnsmz	2026-07-14 20:28:56.184089	2026-07-14 15:28:56.902	a4143ef2-b0b6-4de4-820d-d8136dbe26fe
f0110082-6674-4d68-9013-e18445976308	enc:v2:OHYR9Mxm5ZLzpKxv09jFfN8MYV0kt1Eg/R3wTlRu3CY=:onkbQnNb4HGgYar9:akMO+ZOBYlOR6/+6Wx6Bhg==:6iSUeubro9IbnjtWNf9Hzyqbb9jFwa+4/eSAFCnrw7BdeBNVhOoCEhUAT8oFLV2Sxw==	advisor	enc:v2:HYCPSyIEWMze7wPztYGfUzxXYvPzLOfuTjDzK/6MNW4=:CNS/w1hL+8L7wKol:yVbXJiq9i1gKQ7p0+qCwsQ==:AYQW4obMJgnTP2XY	2026-07-14 20:29:03.247473	2026-07-14 15:29:03.297	a4143ef2-b0b6-4de4-820d-d8136dbe26fe
9582eb02-cf91-4375-93fa-f4d4a2537d0b	enc:v2:cpyblcrRMEjoZysRQjabUztIDrsNahu9l4isI43V26Y=:hcou7KcmvTXR0fET:s4R4jO85KRFY1zSGTcRrsg==:OGAbatsOfz2ezg==	client	enc:v2:8AC4bDwsz6zrXgUwnVZ/ksYa+iAgwtQ1I/BkYZ9inAY=:kqND17C6KMgY+U2k:as7xbNS4k79ME56YJNKVBw==:/3fGOkqA	2026-07-14 20:29:41.264607	2026-07-14 15:29:41.312	a4143ef2-b0b6-4de4-820d-d8136dbe26fe
fe4c8e34-9b32-432c-841d-fabbf4553cd7	enc:v2:UfCNi82PzGntGiZ2gp8QRLMYIWcMF3OpjZwV7ub7KB8=:nAuQ6a8AqoBEZPyi:oAjqF/cPcjDEEVObxSeksQ==:iDnzevqNhB5agfSC3QhL5fyZhSk9RiJVqrD76RD8QW20pbNkKHJB1kcEEgEzD5DJD72h6HXIqAS7	advisor	enc:v2:gTW45qh4CpaU82qmXNldErLXfE3LwgRpBp5biOfOQEc=:maSxhISED8tEnSyD:7ZKnBFltTxqBosTSB9r6Lg==:SlCQKYe38Q==	2026-07-14 20:31:41.366202	2026-07-14 15:31:41.422	a4143ef2-b0b6-4de4-820d-d8136dbe26fe
28ed0097-eec2-487e-a66c-4818e9198750	enc:v2:8TFMqGVo1SXpo5fTlGOufkjGuAZpdg50ZA3CZ2OYB8U=:WSmwR1r2eXEUvbnU:kaRq0lnqxcvrODs50DoQpA==:plDkUobis0m4BVPkZu8LW8ZBMuhzuzRS/p/eeZBUuG0s2w1JuCg2	advisor	enc:v2:kIznXp4VtXJjOz5tf0kzDp1Ks8IoCFG9YxXwH2vZv0Q=:17SzznWf0w0cJGH0:AtNGp9x9Rm3jRrPP4xjF4Q==:ygvUoq07+KV5RlXy	2026-07-16 20:58:28.670789	2026-07-16 15:58:29.109	78b62638-c559-4a95-ac61-44cb68205ce7
66bf9054-7a3f-4e03-8e16-6103f539c907	enc:v2:rbyFvJjW9r/UKeKgB6KDluipO8YGN188rJXwGCcgYXA=:NdQWsAsljsTJNNsK:jgGMqn+F67P798MY9jfjxw==:/YbnWIWDKU/wLczdw1b8wIodjB7C2MuobBdVwBz3rU9rwhV5838PHoTV+Q==	advisor	enc:v2:bxon6QUFq00hMiyC5CeV2jyPfxz5GjwcMccqPqaeUDw=:OxOpO9B3gV7ZeXMA:wGczsIErr0FxqhEK+hZWbw==:5yZlWYhViQ==	2026-07-16 21:01:29.597242	2026-07-16 16:01:29.643	78b62638-c559-4a95-ac61-44cb68205ce7
504bf257-b137-418c-99fb-a12145482383	enc:v2:yLG+71NpgPAB4+SZ3Dca3Xrnn50/FhR0GYePQq3Tbdw=:IdSmJ3yA4dF/Iu6C:HyuvASj87b5qRlQ3bFv5eA==:1/z94FCd8ZISJOeMNQPZGpXMQCdi/Zq8IfXyHiMamB4hu6hHCMu4	advisor	enc:v2:ZvdkJD2jFZBNoyDzW7Tb7CEukem0PHenUI6Xv1YY4Fc=:wGHpAZBThGjmjspN:9/PpJjWieshjNdOrtneeDw==:c/zrXtsrlgUUEMWV	2026-07-21 12:44:44.488226	2026-07-21 07:44:46.252	50175a9c-730c-4377-a045-5a329c70a226
532604b5-c574-46a8-a147-d3adc653bcec	enc:v2:KXmxwSskJCHeI0Vso86ShIXFs9iwP1sQNOHa7halCZE=:IYiEon/QMhO8zgxW:mjNN6wGH8xEAK4jQQAzDhg==:XoBf8CJY	advisor	enc:v2:/ErbwE4Ce6kYxH5GNREnJNA8s4WFPogmeKPEa1k63FY=:DFJbQtLnnex/2BGj:xkDnCl/obHWmULKjZSiggg==:xBIY+T6kzEQan1Y2	2026-07-21 12:44:52.551077	2026-07-21 07:44:52.609	50175a9c-730c-4377-a045-5a329c70a226
efb25c35-8a45-485a-98d1-2f1677b07f01	enc:v2:KUQjFHU06a1JOglcQKFBn+Bi6dMukCjFjNR2lpb49IA=:Ho0P2rbLnfEe7bXV:P7LpUqua1BLKxhQo66VufQ==:wFHc9MKG96Jl1BE7aRs3fJojMfQoqcLg6fAtWwYtUqj0EsxGBqn9	advisor	enc:v2:vUsKxmeEYNTnCD7e9R78jLK6SlbsKRGhynfCXPcEn10=:5XuyaDRlrV2CeH3W:ppOgnwLw1YzR8dv0XeeWYQ==:Vhu+t1uR9/zzR8Px	2026-07-21 13:18:43.442565	2026-07-21 08:18:44.412	b4f207c5-9ad5-4e14-9b91-3c433b5c7e38
\.


--
-- Data for Name: ratings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.ratings (id, estrellas, comentario, etiquetas, created_at, session_id) FROM stdin;
03ced6f2-d215-4c62-af09-1c45fcbb5d7b	5	asdsad	["Profesional"]	2026-07-21 13:19:15.406489	b4f207c5-9ad5-4e14-9b91-3c433b5c7e38
\.


--
-- Data for Name: sessions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.sessions (id, codigo, client_name, identificacion, apellido, rol, colegio, colegio_link, tipo_solicitud, status, created_at, closed_at, advisor_id) FROM stdin;
945ff1eb-461a-47f4-959e-7f5e0ee6838a	RC-2026-T8AR	enc:v2:BlWvXxulVuIAlVTUH6MOuCXg1/8f1yK7THUa5+TTpmo=:bYgKNo9q6bQR+J0v:XYJyL5T4q8lVrrNf8XkX1A==:irXY	enc:v2:bKLkvAwxU5Ays8u2wpiIAO0YE8jZSM5w2MThUsl3Gjs=:0HOASiyF50x6CW8R:2gPrtTVrRQ9h1RhenYq35w==:t9ps9KzwA5E=	enc:v2:pmsVdrgHYRGnNz5CNeEkPAE4hfIV6nA/VjHdh9GepEM=:Aoe8LwfOmTtXErO2:9Ek39A6RAvf+eOFaxsVJvQ==:N8CG	estudiante	Colegio General	#	info	closed	2026-07-13 17:55:04.226656	2026-07-13 13:09:23.666	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
0b8989e5-0447-48cd-b3dc-f6c5320c26d4	RC-2026-JXMN	enc:v2:LC1d9/EIprZwlSIrtJAyHylbSJjFwgTkQs6Hqjxpkz8=:Czijl/nNwPSaU156:1rcri6DLtPQdFUk1U7RTag==:/nMp/tw=	enc:v2:F3rSfMmMGiEZiTOfTTmc22bQgYPRTTt1BcIyC0T3260=:RPU/WILmuPWVPhkH:UjpYRH7LLuNxelz7JEEQjA==:mN94P8I=	enc:v2:sFtdHhEX84TErHY9rLcNhdHQQQLqEWXVGck929Oe4Dg=:+hnG9haZ2WgMxmhY:7foAIAybJo5QHzfusCSJoQ==:729hGQ==	docente	Colegio General	#	info	closed	2026-07-13 18:09:29.794131	2026-07-13 13:18:52.767	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
bb401dd0-4d7d-46c5-a9ee-4fbe00a4c4fa	RC-2026-NLL-	enc:v2:Lzy9iS9Dxpv5J8e1Bywq/+WlZjF1CDAtymK/AmPfvb8=:odOaUZ1wfYSDkfOF:cfZk1t2lEFMmghpj2qfgzQ==:umxI+hDgPg==	enc:v2:tAEl2xUnz307c52/sFpGDqKn9bhzLs4ZOUKOJ6hGcN0=:Kbc27NpITN/nqYFK:jSw+49QCasPm8jWzDF3WFg==:zf+GA/M=	enc:v2:wbt9oeVH8eV02sneF0J7uzcEGVAgsfkr+Hh9HTWSek0=:1MZHIqgms6orxKTV:qLOfLypPhbJchtUlsJMD8g==:en89SrtD	estudiante	Colegio General	#	info	closed	2026-07-13 18:23:22.606381	2026-07-13 13:33:14.897	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
60d50d0c-b993-4259-8e3b-ce25c4189850	RC-2026-V-B7	enc:v2:8vfRRHbKc225myTq4JGto/LC8qg7lAoU5t/VNR+NfEc=:PAe2uZQIzhJQyeiR:j48uvn10PPVM0Fndzp5SKA==:LEgsgqsM	enc:v2:p2V3SPEg/Xew6td0A5xeHW7cnSetPcIJjpoYyIBCnc0=:ObxdhZ9vKYzvc4d5:5LtBJYkJcQpcubdqkoL8Cw==:hhv9KA==	enc:v2:39GaAcJ/Fpfjtalxy9xL+XTtQKDNvdoJMhHSm0pr97E=:UQi46yNzT8mJtZks:e7fw6xwhmuKGv7aoqLK7xw==:65sp8e8=	estudiante	Colegio General	#	info	closed	2026-07-13 18:48:48.645375	2026-07-13 13:58:41.662	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
d756b6ac-7c05-4ea1-8203-7547b6601b96	RC-2026-5ZKM	enc:v2:sgeTq+E8Sb6kUej3kHWlIGeThckcj8ZOsOk6fVgxON4=:2zKojMmi9PukuNFC:aCmZPTPep6ZVlNhyUAmtKQ==:ZXZ16yPA	enc:v2:6TtZOxxO6Avyoo2VugeHf3uGfqaB0hNkHlA3+BerS7Y=:mzxvruCAv7FrNJDB:ZhzMeCxXgctTAYsCEv2dGg==:FFLi4KMs	enc:v2:IoDELGWf4J9dLhJm94BTTRRP03fafEJmGTyaHAo6AY8=:6QaAu8Zql5OEilSo:7erWkuDvF0428JjMT1egGg==:RVZRwNPR	docente	Colegio General	#	info	closed	2026-07-13 18:59:58.28334	2026-07-13 17:23:45.333	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
357fd151-977a-43af-a29c-641e4b8cee25	RC-2026-TO7N	enc:v2:7lWIRvAIN/Ax1JUYjTZbIBxC6ZPDA44237ZCj8WKZWw=:7tpCASpDKJQsRCfc:tiZNWFYcD25bcdkQFARz6g==:fYqI8TmY	enc:v2:fGKad+YuSp0grqD9NDKBGvvNWuaaBJZMxD+ydg+5T0Q=:Kz7al1inTClv0FMH:vd2DB+u/R81ZofBg8pC5Dw==:C+vNxBo=	enc:v2:oQO23dUelMv6LbfBOdrLkwFBkW0QIZpMJ7Cl6Bkksd8=:GaQ38QqjqepnSIYf:D9rYuPU3XOkNW1tNe4Tdpg==:rTGMNcit	estudiante	Colegio General	#	info	closed	2026-07-14 20:11:55.887798	2026-07-14 15:15:44.228	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
2bc1c379-8955-4d41-a623-45d0d0eab009	RC-2026-A2PC	enc:v2:DKMkcBQ2osDnJNHbgbbkbge8rnJzOvqgpzUWQpfxAIc=:dk64waHhklmfi8NK:RVU+Py2nJ6HeFqR+yjXtbg==:5pv7JHRd	enc:v2:XTGL778smK+OmMpofx0rSFmarnXQ7OzcWol1m6Jft8U=:+6aESVnkGLS8x3eW:w+NO1uVgBrfud3EV7sXzqw==:GuqFIpgF	enc:v2:cbZ+G4qcPpNCNY1GMQqLWs4p7bzTUBBVeichOkXICLY=:0kRwbziq7M8xu3cq:AwUjTkV4EXYTv0AHLTKm9w==:n6GN12fB	estudiante	Colegio General	#	info	closed	2026-07-14 20:18:27.321738	2026-07-14 15:28:29.441	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
a4143ef2-b0b6-4de4-820d-d8136dbe26fe	RC-2026-DIKL	enc:v2:ZZK0xUwiBqVQIjjmVbJXJZICVcR2HD3g63yyre7nm40=:s8rj5pbNRJ8iMEeR:+w1OevjRpf88hdh7YTGs0Q==:CyWa2BFe	enc:v2:/SS6QZ3Zl4utf240ZjjS9WMYmUmmMPVMzhtkD+2c33M=:Vvvb3FHmhIX71hte:tj2AZjSsZt9TP4RZgEOPJw==:eSnsz/RC	enc:v2:asg/mu5fV/ovDE33IQf5OHnON/rq4Fe1hhEuf4+EIFQ=:FZ5/TcM+B/SocTQX:flzL0+se+VUAT3JHaTq3Tg==:mTXXFs/5	estudiante	Colegio General	#	info	closed	2026-07-14 20:28:44.893261	2026-07-14 15:31:43.711	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
081b3b2f-ece9-4c8c-a884-511a62d8b544	RC-2026-TY5F	enc:v2:qMVqqPQhAHmfP+deC6bnYbiBtDAsJoqwl5I15MCllik=:206hFygM9iwDG8nj:QiQQo8+JedkcvzHvAyuGUw==:NVF8aPHe	enc:v2:suWr/utCFVkkgDYWkYzwDhf5shW2EFRcv4vSUa/y7jE=:y6yTUs7FA/VfZgcK:DjlygPYM4N7zvF8oDuyddw==:ifDLn8hQHtTb	enc:v2:XWNDqCuLEkZmTW044tBk5s2QE6IiWxlrXBTF7TV15AI=:VSQ0tNjgpaCzUaMa:m98BlJj4O/PbnztHaqbznQ==:/npI	estudiante	Colegio General	#	info	closed	2026-07-14 20:34:06.31402	2026-07-14 15:36:01.749	\N
429b8d2d-54e9-450f-9776-46ce07438c5d	RC-2026-YZT6	enc:v2:+unNSTwF0QeM5HQ4OQBfLC3DcMe5KThXfDF9ejMoQZI=:fdDLGSJeic1yBO3L:lkQFKq33hMz3RaNR/z3fGQ==:KuJCeX/2	enc:v2:9ukrfAtCmom0TZV9sI7/9nb/g8CIWz4vLqQ/mLNJXiY=:uvzHXpcTKPeIhrnZ:1w/7Z7PnWiEc+UazogVu7Q==:0qwwmOeh	enc:v2:lwVhpjOeFVYbIQb/59g++Qf8Nncs1Hic1ZeLWuo1TaA=:+c1QklpfM7cIbntm:vO8oTCKnTYgwmUURElowgg==:Z1W/Y2Rw	docente	Colegio General	#	info	closed	2026-07-14 20:38:52.242613	2026-07-14 15:38:57.832	\N
5288afba-4aff-4624-b09f-a84f59072694	RC-2026-FH6C	enc:v2:IBItYhr+iGyx3oWf08yZ1t/6nQwx2MEqxpYvmED76LY=:DsCK+gcFtQY7llJ4:IKT/06W+N8INMWT6NHbKww==:ZD+xLKs=	enc:v2:ndE85BGev+jMl9L0jXE76MnW6I8f7meSnxYgtysENsg=:yPlGS3yZQthwfR2i:LXavCe10KRi+lKxZ9kWECQ==:3odaDvU/	enc:v2:Cnbr09q6w5cUS/HfhKIhbAYiitvopE1HtyNbX5lDSO0=:+sdwEJFtP6+EzRUj:U2UqEjy+c3s+8QDyzPazvA==:aXDVOjX7	estudiante	Colegio General	#	info	ai	2026-07-14 20:39:09.775535	\N	\N
bb1a086c-6e67-41ba-b6ff-dfe4086f0c38	RC-2026-1HM1	enc:v2:qNk3L7R5kOp39JWxWw9IPyiREJLfc+JN2k0MMok4w88=:frnOgcIPepAinUlw:rPLwMYCYzPjnIyeQWmbqeQ==:pWm2	enc:v2:z3bqi3UyM9ao9bFR+OfkwpEps7rFx8UoxI5noYYLJNY=:N6uMiFypgAxXCgG3:i6KDCyOHiTeOJeNhdi+6vg==:iAVA	enc:v2:uLF39QBVzyF21vPeS7dm812ZJy9uqo4tX+nyjiW9zDI=:iKNV3wIHzJHpJsdN:GFMQn3oZmxjmUR96x3EUmA==:jKu7	estudiante	Innovacloud	https://innovacloud.co	info	ai	2026-07-16 19:34:30.087771	\N	\N
45b0459c-dd38-4dde-8f76-9574987b0159	RC-2026-5M8V	enc:v2:XF2l7PPl7aDpjfogM7K2p89477WQF8DV+Oiz2IPgty8=:LzFK2CGEbsUPlM1y:oeJvFYP90/s1JW8bFQATPw==:5q1S	enc:v2:oay0/h9+0HSYCwVH32zjbPOSA4TUpktSz3wtIi8la20=:89T3EvSOCFXtZKB7:cA/vQNVUzasjEpbvSllU9Q==:lRX0	enc:v2:/yGRnNXjZRKz80t/h8EBNq4S7m+G9iesGcUUJK80LAo=:B8PsIcHpvwWwc2c6:eYQYFRTGlqnwscyDWv5aUw==:fi40	estudiante	Colegio General	#	info	ai	2026-07-16 19:55:26.147587	\N	\N
cadb5134-3296-4176-aa39-4e51aaa984c2	RC-2026-4O_5	enc:v2:/My1bDd9tAeZg16w32Xl6eTxGkQz1oa8j1nMpLNxSZc=:bPkIP3GLTKk80xK9:YypRHBeFTE09NQ7SsNl9MA==:sCs6g68=	enc:v2:UOt+3no5M/+q3RqFhicg+EYd/UccLLA3TbrKLBmu0DU=:O4Blf+YqoROXI6SB:Nx7F+FBXw2LqyZm+JYI+BQ==:DJ2fTXDF	enc:v2:gZkJ7e8QIhJfwyaYbys3MhMlgG8nWK6oiMW5Ylp4WAk=:p+l9S8I2sgdKWAkF:7c7dQAnfp5Wp6EsSf2Rbuw==:2ExbCg==	estudiante	Colegio General	#	info	closed	2026-07-16 20:12:10.28664	2026-07-16 15:12:11.922	\N
38dd86fc-36ed-471b-84cc-405413eb2c4d	RC-2026-COS4	enc:v2:2I+yAGfWPzdmk/QnDbfVQsiy1fwnPLV6WJTb0w8mFGo=:hR2wxeOWhblBdtmB:jFODhVwkUPOXHDTiPEnk+g==:CiMM	enc:v2:Hn93RKMlGHac+8Ac20f0ZDNBq8H3pnEtnuohkYzJNCM=:oXXmuezAG7qmYepc:wKCxc34axAzWkW2Uayox4Q==:7N6iEpU=	enc:v2:o/vc+hxx7NcsaM7NtaeP0Ix3Xa1ISlKTTrl/Gg98BUA=:GcNQ1b50Mebdl02A:/3eEktsNp3UfUE5goJjHXg==:qly3Govk	estudiante	Colegio General	#	info	closed	2026-07-16 20:12:37.066193	2026-07-16 15:12:47.518	\N
d3c3367c-2ee0-4350-9618-cbee35922a38	RC-2026-X8FV	enc:v2:af7NJu+Yb+UR5087gx5wEBbfpSmTk1Y9iv3sKcIKVAM=:HXzsvlvLtwqsReo/:CYJ7lQLBrwWyXcLbRG2FvQ==:Zr8xM90=	enc:v2:NeCqvM0jzEvo66IAyH9RGH2Hd5ZQl1rET2xeSfAfEwc=:LiSG9zrmxlFgMO/B:RZrUTRWko61tCFRlN+o81A==:UNS9	enc:v2:xSjH/e9ZMKpCL5xC5mMgAdSjxUR+fkh7S0noqZrmWhU=:cKscnFS0D+pnUegE:OxhmMzMDxC08+KVbMKDnpg==:aBMeRA==	docente	Colegio General	#	info	closed	2026-07-16 20:20:14.160041	2026-07-16 15:20:16.304	\N
bbcc8884-89ce-47b9-a6b1-a0c3d2085657	RC-2026-ZHAW	enc:v2:3fscY3IDSHNgw22Xdu+lZQsOXmwTh9XEbEsUKr9iVzY=:2ItM8dWztqZOWA9P:+Y/I9I2FUfJ5HlZKd1PtdQ==:/5Lc	enc:v2:mgHkLduMHmghKEYWKlHfN1DyetLrrwENuiM5Ssc8/54=:xSYkzW0RKHYFmiB6:BIQvwv0Vgk+PlrgEUelK9g==:fPbjjLgI	enc:v2:ke6vD6LP+7oXknJopN8moAnIU5zwpAZSmaU69Rlxca0=:21Jj/uHQhZvzC/cU:rCidNKTTji3fNm6FMilapg==:sUNnwfTT	estudiante	Colegio General	#	soporte	closed	2026-07-16 20:25:27.855349	2026-07-16 15:29:11.133	\N
2ca04af2-13cc-4a95-991b-a78aca34b75e	RC-2026-FCBL	enc:v2:0nC7NoNjKjiYklRjgt3kWuYCjDAs025Awno2SOPocV0=:3R8DyNT8Vk5294Q8:QLEQGAs1rCXMYzbJJzHLSQ==:EF+x	enc:v2:I+man4w1+h0sYlREWt/esd1k2XHLYKsHnSYH0DvN19M=:CEh8mzwzpWEoNZ4x:BueB6jZbbmK9L16ZNJPD3w==:1v0xSCQ=	enc:v2:MNCM3T+KvTQpkiWfglkP/Ftik4tEYMbokWQp8v2uSfc=:dJ0V0mhHilDZwGhL:tK9AvisO7zTQOFnNlsH+kw==:8tXqnQ==	docente	Colegio General	#	info	closed	2026-07-16 21:09:48.373466	2026-07-16 16:10:04.095	\N
e5324e9e-b2a9-4651-a092-dc1b91d64f5d	RC-2026-9YEF	enc:v2:ufSMtSpKJYV/P4N1jbPnFUlPR5fklJhxOJjfoQe7uOc=:199yFoXOSSxeBWNM:8TTIM6luhQggOGCavbv5qQ==:pPZ1pBSP	enc:v2:zi/EPBzGrp5qXeEn1knfVi2HtE9L8pvwFIP0O/YWccA=:a+476fGndd5nAELx:TJ844FQZy22C44iTrMN6Wg==:QuTbUP8=	enc:v2:ouh4uO8lJr1vVL/YULlaIC8kYbm8arVR5kz8XEVhYDg=:t3cVwtLIPewX/+ci:WEIqWZQiKV26yObNwFzpyQ==:FsE3DHC3	docente	Colegio General	#	info	closed	2026-07-17 15:15:45.612026	2026-07-17 10:15:47.889	\N
f491ebcd-fc52-4e70-be44-768ff661e720	RC-2026-NGGD	enc:v2:U74NDIRYaSfkj0WaRPrRlZs7aqJHyOiKzRwOhSYOn9g=:Yvc90K/vkCUiynMF:nFZdhqtHa4wlzlkKNawWIw==:2wFe	enc:v2:QCKNCEPPLkhYESnJkOuriC7B3mCAzwEt7K58xIdjGNo=:D2dsVAzLgZOyyS3R:Qk1HySP2KFQf0CWo7+Oang==:SzuNfCo=	enc:v2:WO3fQzsvRDyCbVZ8N0z+rfeYUYg8LpEulRoVwAynwyo=:JxojpUjYIERVLVNF:VRMc1Pn5dzTdrcc6yBQTVA==:u+QUSmc=	estudiante	Colegio General	#	soporte	closed	2026-07-17 18:06:06.736326	2026-07-17 14:19:36.761	\N
ed8b16b6-550b-4909-bb52-440c0abff929	RC-2026-MMLE	enc:v2:u7xbnZ+6v2tCKJCcuYj2fyjdLOUnDmswfrb6owF+HYQ=:Q/rlou3nDfKOUReF:3dD9Ruyw363jj03qeD6Zaw==:4UHjQPtl	enc:v2:UBxTTmFolqHuKidKRU2ILtNaCRA2tJSp5//nOLlo7vo=:rgi+JGwwIOa7fEh4:et7+S5p/57vkccO72j2oog==:yYdbh3Q=	enc:v2:TNXOQhix8nahlEeN3lz043SwbmrC/06Tc+z/W7pggKg=:wYbGLJM6GIK8WjFG:wUzbMqp9j9pet1ib9RLJmA==:fxC4	docente	Colegio General	#	info	ai	2026-07-17 20:52:33.31907	\N	\N
33fed953-f57b-4c5a-a48f-a91136e0dcbc	RC-2026-ZCBW	enc:v2:BcTImoYWF4537hM78urMfinyRq3gTGjsYthoUmJ9abo=:Lxoji8dgKHpBOEYp:HrrTdcnbrUWnUUUx0MX7qg==:YpWGvk8=	enc:v2:1bAzjEYGZhPcmyqB30KG9jHFLbRgXl7vzkQMGTKuHfU=:d4N+laWa5i4Ay4dE:6b06lmBrm2Hbnj9GCm+PLw==:I/4qJiF1	enc:v2:Gztu1Y+mGLusynvoEjwVnB08U0XgDFp7/lmYtNETtfU=:4Z2dvIWho7kb1dOZ:MtQSVKYTgzPaFfxFueyBIg==:pfZXJg==	docente	Colegio General	#	info	closed	2026-07-17 20:53:48.657062	2026-07-17 15:54:03.304	\N
6a0b0500-2a6d-49a0-a552-0ca0da7d74fd	RC-2026-WL9Z	enc:v2:8nclLMJVYCBZjcw3bSfSCOPw0qeKqfNtPYssG0h3sWo=:fg9K9NlpSkH0nzES:Hcw/u8HV8LOe9ZWmMmRzfQ==:5rrBtg==	enc:v2:HzodFj73vBuvmfLWpKGnZFkUiNBCoVJlHZzWmYbvzuA=:xWvMIlIa60pjKvdU:h/dWHFyDDunHh3G9a/PIlg==:yU4MGko=	enc:v2:d2kTxuy/JmXXpcVw6bsJzSiWnQ5rBLoi1kVBErx/UQ4=:KKR/to7DmIlk8JS2:s/HWrDIQt9YI+E51g1gtNg==:Fd9Z2Mk7	estudiante	Colegio General	#	info	closed	2026-07-17 21:03:13.594536	2026-07-17 16:03:15.478	\N
78b62638-c559-4a95-ac61-44cb68205ce7	RC-2026-YO73	enc:v2:spjcnc2XlnxvDfSswsdBidkxQ+Qs9JEQfSSldPBGXJY=:vczoKDorlV/haxbc:5etksJLnTO8bBgwhJt8/wQ==:zH40kwgO	enc:v2:lpWC9yVl+RNkXrFzIRxce/NCYkFcHjenPlekwr305rU=:QsIQhVcLBAVzN27Q:3G2ldlOi0u1kv9MYzo+n0Q==:cbyjzNs=	enc:v2:toZYBc0/wd7wCI3v4QDZNqHbrSPHyK9m1xHf8hTjzxA=:oNnYwGsCEoQIlnJb:Ssl0PU1bAgREIaOslhgnFw==:BLdk	estudiante	Colegio General	#	info	closed	2026-07-16 20:55:39.365782	2026-07-21 07:13:16.896	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
83915de8-844e-483c-b988-01c0e8a9636b	RC-2026-EBF5	enc:v2:9XgtvyHKAtVNCj1CIzaDhwneyAmbiskKG0wV7Ifo0IY=:PLMlF4UpNrtn4RwF:ncpbkaqNHpxbbILSWI+COw==:8SpvsTQ=	enc:v2:YiioEej8/7lREpfLg+KeNJcP0OmBr4/NCa9dAMbWj+0=:61bTZx87gEC1AX01:8jaSLzMlOH+8i+/QolvMbQ==:31f49CpK	enc:v2:AczPfEnPatD3WhfTiHxV0SdSbTa9s0clii844FK3tJw=:0O/LaG66PGY4BRe1:e0OrrPKPdTwB5H8rVjD/Qw==:Kfjm1g==	estudiante	Colegio General	#	info	ai	2026-07-21 12:41:34.507682	\N	\N
50175a9c-730c-4377-a045-5a329c70a226	RC-2026-PKYL	enc:v2:srw4uaOucjLttZZi83cyCYlTW+ki5Jwrg0V3XV4jFWw=:IA9grhdAcYBRiSH0:sGRnwgwVH22gaoLCNUisPw==:kizHQLCbbg==	enc:v2:pA70Uihw15HMi5uYRkGQDFqhlOdbEQQOi3T1u70KwL4=:RZ3CztJ6AxCLZ5Eh:9gmJ/6sTGUyRYUKX6YDAVg==:xzbIRKk=	enc:v2:0amj2F2oL5wIfHngMnABJRKs2E1ApvXdC0ljcWpF2TM=:KziOjM/1XTMGhiZk:lT60Ub3TfIuVtZ1XmBMDrQ==:n05PZHFV	docente	Colegio General	#	soporte	closed	2026-07-21 12:44:30.555854	2026-07-21 07:45:04.704	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
06aae912-e17e-42cd-97ce-7e20a6a46439	RC-2026-C7PQ	enc:v2:0j7h7L5nW0SG7Wi6y1cnSITUnS9eWOY4ce7ScbhJa7E=:C2rekEl71fCTrX+n:gFOAWqugrNufy5Au+1KgiQ==:8K8Z6+DD	enc:v2:qEFhSSHmXDjOZ2C753u7HdwciWDNNNQxAov6z9i+lx8=:4Qi8j1z7flxFZ27C:VNQ2XL5o/ipei6tHLEuPCw==:adn39Qo=	enc:v2:C30+CV3ZP+SLtt+R0X1S0YqoXAmsjGzhibNP3/z7zRM=:DP7ezAjGohamF2GK:lCN1wVPTG74IVPecd1cRyQ==:Agt9OiTm	estudiante	Colegio General	#	info	closed	2026-07-21 12:46:02.225423	2026-07-21 07:46:24.862	\N
069451fa-95b5-49dc-98c3-e29ea9348b88	RC-2026-V2RF	enc:v2:NE5BnbQuLKY2Tqd2cD/YcFStiJCCWRY5P6iGeTowuCU=:9wncvOT8iCI5rSEW:s8h5apaWqC2xicfqGYUH/g==:qBhA	enc:v2:z8M7co8pPAgnDQCQUevOaDVOV5MgsXLFa/Jk2UO/Rms=:4hX5CTYSQHT+xuxM:mU5oS8utjx/htPImu33Hrg==:9oSNURSA	enc:v2:TaYlSesT0NmQh+unyOZnJnf4mlhGmLlKu/yy/dlDaw4=:nb1lCZTBmXsuC0uZ:VI079g9JtPt5RBUKuGqfLg==:Tz4+QcpL	docente	Colegio General	#	soporte	closed	2026-07-21 12:46:58.475398	2026-07-21 07:47:09.371	\N
b4f207c5-9ad5-4e14-9b91-3c433b5c7e38	RC-2026-LZ7N	enc:v2:cVm1mPtFRJ2uOrMfLZoiwj8mAnUiWQRYQSCrFXzhjl0=:/rcm9oaq18PH5wpN:CkxcPuhboO3bXVpcyEZaXg==:JXin	enc:v2:4mVJhbxf+B+ZA8PvBzwwTB8+56gTYU46Ycz32Z9yMSQ=:iStaS6FU9xAS4KY8:RtzOMbi1Z2akFgGEgxzF2w==:0ejuhqEJ	enc:v2:mvc/9ZqvOfq61dwb+aJ3PZxplsthtamAk5UoWzEeLmw=:Q4oKoqe7roah0OTA:pR/DgYtH5UzExa9+R2NYnA==:8WD6taE=	docente	Colegio General	#	info	closed	2026-07-21 13:18:37.517058	2026-07-21 08:19:12.66	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
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
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.users (id, name, email, password_hash, role, active, created_at, status, active_chats, profile_photo_url, refresh_token) FROM stdin;
8c25b4a0-4bba-41f6-bf3e-2111a5ad77be	Andres Sapta	asesor@innovacloud.com	$2b$10$WLs2KhY3NUqBpx9qeM4RQuylPtYh/55uTnahKU3zPoJD3PaDbZolm	advisor	t	2026-07-13 16:53:21.194109	online	0	\N	$2b$08$GNkTB6YuYquMVo069wNwqu21QsxXL8drRMnzgsEhTS.IGxcyYU27u
a5057b57-bfac-4536-9936-2430e8da5d9c	Administrador	admin@innovacloud.co	$2b$10$jDa1rlSUMzW4zKD4w5MM4.s2.0DR6XMkDXxEy9r6AyHPIo8Xjq3Aq	admin	t	2026-07-13 16:53:21.187022	offline	0	\N	$2b$08$qbv.yb0csTH2N6lIf784jOPzkrJ3.3qlgSWP2wWUo3isJ8eJq/hf6
601201ff-ff3b-4781-9ebe-6258641b86c3	Jean Munoz	jampimu12@gmail.com	$2b$10$rlmhqSd4oF7fyLjyCGp2ke393vgj8spIEGX7sH/xr6X7WRChz5dpS	advisor	t	2026-07-21 12:31:55.46918	offline	0	\N	$2b$08$pdA1pJ2byUul2A9QVwYCweygdd98ewbcr2yMrF8mbavAZmaYuCgqK
\.


--
-- Data for Name: whatsapp_chats; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.whatsapp_chats (id, phone, jid, is_group, name, profile_picture_url, role, institution, institution_url, city, email, plan, modules, status, operational_status, operational_status_updated_at, unread_count, notes, tags, last_message_at, last_client_message_at, assigned_at, assignment_mode, queue_notice_sent, out_of_hours_notice_sent, priority, created_at, updated_at, assigned_advisor_id, fixed_advisor_id) FROM stdin;
e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	204011668025465@lid	204011668025465@lid	f	Jean Munoz	\N	Cliente WhatsApp	WhatsApp	\N		\N	WhatsApp	["Atencion"]	active	in_progress	2026-07-21 07:30:38.838	0	[]	[]	2026-07-21 08:22:28.482	2026-07-21 08:22:18	2026-07-21 08:22:18.996	fixed	f	f	normal	2026-07-13 16:56:06.390919	2026-07-21 13:22:28.48553	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
d2275ad5-ce5e-4d59-8c5b-a702665f5dc6	95924319715525@lid	95924319715525@lid	f	Raquel	\N	Cliente WhatsApp	WhatsApp	\N		\N	WhatsApp	["Atencion"]	closed	closed	\N	0	[]	[]	2026-07-17 14:38:24.293	2026-07-17 10:17:16	\N	\N	f	f	normal	2026-07-17 15:17:19.063758	2026-07-21 12:30:48.795522	\N	\N
a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	573105205946-1612188845@g.us	573105205946-1612188845@g.us	t	Grupo de Soporte	https://pps.whatsapp.net/v/t61.24694-24/521198155_1300821698254976_1131856764390309570_n.jpg?ccb=11-4&oh=01_Q5Aa5AFfEWUj_Bn_34kSIam7fWRVvegG9Ft8msRpb7MsmzZG9A&oe=6A63668A&_nc_sid=5e03e0&_nc_cat=104	Grupo WhatsApp	Grupo	\N		\N	WhatsApp	["Atencion"]	active	in_progress	\N	0	[]	[]	2026-07-21 08:23:41.278	2026-07-21 07:57:15	\N	\N	f	f	normal	2026-07-14 14:18:09.443471	2026-07-21 13:23:41.281727	\N	\N
\.


--
-- Data for Name: whatsapp_messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.whatsapp_messages (id, meta_message_id, body, from_me, sender_name, participant_jid, status, is_auto, type, media_id, media_url, mime_type, file_name, file_size, edited_at, created_at, chat_id, advisor_id) FROM stdin;
c6a0025e-4ec9-43d0-83a6-2c4cb9848d89	AC3135E2AD845DFFAE6FA68F481790A2	enc:v2:7zhYulU9x6gzTNea10FMTbrDafb1ZWQP761W2mtmOQQ=:wGnh2x9376mt3sus:2ez69DdnY1RKJX0w9Jqnxw==:P1sFrg==	f	Jean Munoz	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 16:56:06.41258	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
c5359829-1d3b-44d4-aedc-c85795c56748	ACEC9CE4073B75A35B6EB37CCBA4EF0B	enc:v2:qiD4T8GvZ9ojnYkT1fR1KRzT6/K/iF8qia2B/kcwurI=:+OzX1MDfH3Zr47qL:nqF9Vzeyia/FGb6T0Wa9FA==:5Q==	f	Jean Munoz	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 16:56:07.25006	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
a149621f-c294-4fee-b06f-714a1592c980	AC67F87257A74E423ABF1F9082A2D647	enc:v2:ueeu7nqnGaPZvg+uTdkYCYL4RvOzAaqL+VVWRhrOiHE=:WlI/BtJiSazZeYeo:bHgbkW37j6bdeONMR2eTUQ==:viA0iFUy1+c=	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 17:16:42.320971	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
f63e72d9-d3e1-49be-9e60-e2904bf8c47c	AC997B53197F34CF3812D8CFCE8F512F	enc:v2:tR7vpjgLV7VTQQiC64n9VduFN4zoL54vG6Honpya/G8=:eZ8/MRK41DgoC+29:wIyFsWy2jT9P2FfCNiA3ew==:VLI=	f	Jean Munoz	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 16:56:17.863906	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
affd5a8d-d3b4-4783-ba10-44c62096286d	ACD6E7B4FD3E42D8C49498A8DEB285CD	enc:v2:0kmDUtX2RRhMUEOloIi05rkO2sc58IjQ4DpKKb5wiOU=:Bsu2nPtk2xsD616Y:EDfiszGi42HkDyXLTl/8IA==:Awij	f	Jean Munoz	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 16:56:59.938232	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
e2ba17d6-418a-447c-baa8-151d12297e3c	3EB053ADE6F1A841BD06BA	enc:v2:XrEE06qQ76X3emv1jU0aeMZ4c5N5DUVc8mgGppVfogo=:CvrtwR7zd4CoPSRI:3IgND+tMEE+v1agO73J+DA==:V7svIWMI3XgZPlRmWp+dbY+bN8UmMC5/AZ5011v7Ouk/KgKrT9PwC7Nz5zkLh77qYP62w9oo9oI633wAzQZ29Ro6cRm5x1EXJHU=	t	Sistema	573005996359@s.whatsapp.net	sent	t	text	\N	\N	\N	\N	\N	\N	2026-07-13 16:56:08.334386	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
8fd2be4a-14f1-4829-8250-1e54462f3811	3EB0892AB8976DE441B3C7	enc:v2:KzbPQtyZ8Yd0H+gblHk1z+8trAsubMxisb4PYnrWSvw=:+d278PGwZxWzatD2:0lir7Jyx5AEM4S12gtTK4w==:USqiY70BlkdQtLXZP04WkpkR4PeIPPc3hp0yW6PxogxJPgJk9nahFBgpjgfmYSm4lGEi	t	Andres Sapta	573005996359@s.whatsapp.net	sent	t	text	\N	\N	\N	\N	\N	\N	2026-07-13 16:56:36.525337	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
cb304ff0-ed15-4363-98e8-37c46bcaf6d7	3EB0EA2768649E597D500F	enc:v2:rUh0CfeZLStZLTK9vG1dYkqCAEj/Utj2kWaYFKAAgLQ=:THrRjJvu4DUQJuPS:gDVZzUus8RIbbIzQ8kzQPg==:E3HB	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 17:15:30.653019	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
cc101ca8-14f5-42c5-82d5-5514f9aaf6d3	3EB0AE6CA0BE55FC867DDE	enc:v2:oGzn1yMTs5CR4ATPNzhDpgztqS9eMetVRMtKFVuWHLU=:qIGWfQ79PFHr81Kj:W76pGKiBZQcovODT8uHJHA==:EbR9	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 17:15:31.712887	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
d69f4b1d-c9a1-49af-b8c6-afcbcbe0111b	3EB01AF104CDF440ACB33D	enc:v2:tntFl2dt3fHrxVscwRlFiLWFhQ4P2lQwM2tN/nfcoA8=:gI135bFTePZ8L9zn:oCFZWT8RTu7osxppqQw67g==:SNa1	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 17:15:32.429381	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
0c1e6aca-1e66-49df-a15d-ec37f75b6212	3EB0D6F40447EC70682533	enc:v2:72XOrprZNiQ49pciy+skOlOtCiWGoptKsP2qGe185zI=:ejzb5RaxFwkz3sWf:uDR/WBl7g7ltQQu+ccJ05Q==:ou0=	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 17:15:55.114415	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
963f4161-73a7-4e2f-a3a1-193fe82f6ef5	3EB086D576E69438015DB4	enc:v2:Sbp6mMxeQ1hx/yAgZNLgkT1oZ0XqgNoAQjCJ5uL8300=:ZehGrciM43Zn/FNb:0j82lQCbmA9n/Nb6Be+YPQ==:0387	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 17:15:56.330312	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
377e1e5f-56ea-416e-983f-37d182f934ee	3EB037C94FF68EC9F235FC	enc:v2:rCDrsXGCc9nayEwCqY6slQX+Tu94mSTr4deqPaICM14=:yFZWmkZVNuIu57N6:hlzsxwIw7Knwqzz7wBY1Rw==:ev4=	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 17:15:57.436425	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
d84c3102-a97d-4cbe-992f-88c1bc9ae856	AC146C6DB9A97123BD7800E928C779E2	enc:v2:TbRpoxh3fcRl9bpZVoo/KY5+AslYdd1arxRAdObm140=:0hXtl3IYStwHgseb:ARY8KDOSZ44Y48gU26vFqw==:+Iq70W8=	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 17:16:44.002935	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
62c6efbf-e4fe-4efb-b83b-16be7c52107e	3EB01E3B677AAA509BE83D	enc:v2:5GvXS7nUE7nA7oMLEJlunSv2ZHXt/lZ1lT0Cr+q0mIQ=:JBuwzsN+qAaUK2gN:lomB+pmeOXgX/kVwKB1l1A==:c2z5	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 17:16:25.940223	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
29e71dc4-50ae-45f8-8734-6122cc977503	ACF21AED99ACDB59CF22040D809518B3	enc:v2:u/0ddr5ER7k7mn0YEqK34JSpRUAEw4SkqvpD1JmeXcM=:vq979iRL+apf9UNU:mzUrYhf+uLnH0XkBux1eHg==:V9Ui	f	Jean Munoz	\N	read	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 17:16:40.924623	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
5080f242-9de4-481b-a1f1-87f360ef183e	3EB04AF292C23C7A79D14B	enc:v2:9P96cZW9t8L7t8TN6CUZRdqTReqa+JEMxTFQyEoiuq8=:/KE/dkDFZvvtMpf4:pJpdX9T7epRslk0fcEbNeA==:czyS2pJegQN+lK/F2gIDO+dqyoTfZr1Gy1YxxADp3vlz3JrLhtb8BEXS5gTQlVt77SZrvOLpJ9xHJQ==	f	Agente de Soporte Jorge arroyo	33247912284290@lid	delivered	f	image	3EB04AF292C23C7A79D14B	http://localhost:3001/uploads/whatsapp/1784040905965-476873456.jpg	image/jpeg	image-3EB04AF292C23C7A79D14B.jpg	122286	\N	2026-07-14 14:55:05.640011	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
e1d3c66c-af98-41da-8c10-19367873de8d	3EB0D02371516CA6F5D480	enc:v2:2UIqkLdITjmUff93gaGmOMw6k0NRds/ccjIz6baiyEA=:le26QD/ZPHTlFe6E:BWvi4nfKgcao9PUw4o4RpA==:/kZ6VT9JRwdS9BUm5sTnI34kXHs/iFurQg6J4ldTdVQq7sADeiP9Au+ZGRSd922kQEbKA1U4jP9+csPY7rRnQiXO9S+MhUEpNFo1/Q==	t	ASESOR	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 17:28:11.53831	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
644616c3-c860-47e9-abd2-1c25d072c4dc	3EB0C921D481CD373D5D3D	enc:v2:N3/E4b52XV8Ja5tCQ13TTt3Gkoz1Qmo0w7mpxc6ERok=:dpnWjwwrK3vjbBPe:5+iOl4iZDwkaZw78pI+ocw==:XN1sayrX0nK0F83Fpg==	t	ASESOR	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 17:28:24.719229	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
7a5659ce-49f0-4335-9edd-55efdb6c0642	3EB0010F0EFBF47546222E	enc:v2:wY2fdLU2jcGgTIV66JKgq0HV5vsknGcEACtxPxx9JAA=:xsT46GjbiRmag5bA:zL+tzFzPMFL3qmBOEkCnRA==:v7RmV08=	t	ASESOR	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 17:28:16.545997	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
a43d1a70-0071-458d-98db-16c8852e4db3	3EB0B23E4740F54A3C8C74	enc:v2:X/WCyxuBt3AVEA5QKWnfZBhI9YP5FMOJ5OR5lrPBBEI=:2R4kpiE3XM64KXu0:z5KU6LGaQs5DnNVg3svqUQ==:VpywY8yP	t	ASESOR	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 17:28:20.102863	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
63c658ca-b1a6-4809-b5d8-4aeaca649cc4	3EB08F03508B5C9001802C	enc:v2:RVRaAJPBNen72b+kM03nQXkq/dyw3D1J8Xvzg85Mvek=:Qb3AQjLTrGQ5ghpo:JLrJF4myZPsOpAfxK/W5QA==:+9FXJSs9shWtgmEtDDZe67yYNb4cLBa+ETnYOmQ6Mos5qfwRQAsi6g==	f	Agente de Soporte Jorge arroyo	33247912284290@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-14 14:55:10.214233	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
16b3c486-f380-4bbb-baef-0fac9469c7a5	3EB07BB977E5E1711872E8	enc:v2:LiQjoDG3WfIP4CDZjYV5QDU0kinuW3Ba58nMZpo40iA=:LK6Lij5zRF7UCOFA:0PWtROloufXKGOFCEh3uAg==:bUzRax4oRpCR4qTmQGtV/R2MgnTaa6je03L71JsGZg==	t	ASESOR	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-13 17:28:28.646975	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
008c9e0e-1265-42be-b1dd-d50e2687ce49	3EB0299E6B0E0E3DDB783D	enc:v2:KFY4/qPYgSZOwcutOocJmvflcffzCnWQ1payJmFUAtA=:0Z0IROE3ZmtrfD84:dN0h1LZUHaryCyyrDm3mhw==:gPl4X5LTluIRDGls4wuB+fHVckngs4baqxZmPqbQJfDKpA0V6Pb/5Lal7qdbXNOcY951400qwfJ4Zr6AnBYXtAjhu3pBrCw/68BFAd5UIErD+Yby78FIb/HujblWgVYKHKkquUZVbLUvRA==	f	Agente de Soporte Jorge arroyo	33247912284290@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-14 14:18:09.464447	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
98892b67-e77d-4437-a79a-885aa0350a7f	3EB07A50924983306248DC	enc:v2:9UzmOLh5daNmfNteZ/4g5kRdTX9Q9zJH5zDOaK51IhI=:NNGwS23ehzN22+J5:AoIy+1/8zfdHXEGZfO9RLg==:jz/hUQ7cRMxL2AUeR00V9eNvACc=	f	Innova Cloud	233246906396733@lid	delivered	f	reaction	3EB04AF292C23C7A79D14B	\N	\N	\N	\N	\N	2026-07-14 14:55:25.735739	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
d8d8d31d-224e-4b1b-ac8d-a52347adb89f	3EB0747A173B00F821E5DE	enc:v2:jRwMHBBazYytYKvrw/J4xmHhRN01UVpcMHD5aWGBDzI=:4Kk3xCi6dZcCdMpc:5hnfOsxfWTUFd3/W3uY3TQ==:eYgB	f	Agente de Soporte Alvaro Yepes	40712263479465@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-14 15:21:09.150706	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
bb10e147-cd36-42dc-9552-c75e95ea45e1	3EB0A0A4367AAD73EC4EF1	enc:v2:OKnXtyJsER6IGY7Ut1sWCqb2HcwU2x/AvIPlB+XDz6s=:Gngnp9ijq5/JlOMR:Ak2Dt6kXaaDqdDEmLkB0sA==:vbdwz85CUihv2eikNec4DANT3E9a653YxpfwcgzJUh5XtrJr5dZXhzPdW0OAnyXUV1CWXh0YpQF872Lz5w3rO35EddwsBIkyZOELDK4vVQwtJWe8bqcC8FE9ViD5b6407UEMAN83qVK9PoBzUCcshjMgIF7EuYM+LFyAD8mWLSpa31Q2fEc8k/lLvUKrUeF0/z+thhtS+1lYA50SjkZp1zJBKKjR9uf5g4X4vkG372FjEN03cOUn9xC1UDnbmbZIulCg5oC8lckEr/yVOwHj	f	Innova Cloud	103676366569665@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-14 15:44:34.484563	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
6ceddc50-c6b2-4a02-81dd-bd3f368452dd	3EB0F8CBD4801B9DCF350B	enc:v2:+1H5MSed6p0kbBOtukoGotzpqtvvwI1QJ6qmj/O7vxc=:LOnePKqCFm3lSGeX:Nkozc2SqXywmkri7287Muw==:mFRCX7pK9aB0EhoTk+qu	f	Agente de Soporte Jorge arroyo	33247912284290@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-14 15:45:38.17187	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
a7361ed0-4d9c-4372-baed-5a1adc778907	3EB0FDEA836F77B5052ABC	enc:v2:QZGCl2SmM3hnVu4iVEWRKdAQGUpfuqHrivw+26UNHcg=:RrkdJC4xjJ41A/ON:JdzZeOjHN3z16g5Qi8iEqw==:h/+cgNvvuh7QSMYKvJCy5pFMcjHrp4Qq1n05Dmw=	f	Agente de Soporte Jorge arroyo	33247912284290@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-14 15:45:56.980559	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
9295f633-2955-4b1a-ac72-4a23206be1cd	3EB0B333B29C111EF1E512	enc:v2:5/cM6zLUNYR4OzWKK2d57SOrMBJgEk5/zDyRAl946UU=:DeqTNcjChrmJz/bB:shvvJUhtr10L7TKBWzjaUA==:PeqmDl7ps4w9Rg==	f	Innova Cloud	103676366569665@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-14 15:46:05.775241	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
747dfdc4-1509-4bf6-a3eb-2d67612a17ea	3EB0013351E04056308623	enc:v2:tUwGTkC43F4Cg9qNqz8V1ShSPIt8wGr0qqJCKqGNBJo=:kuAdV1Oz6hRSCOcj:eWxAff0Elz00/h5NTaIR4A==:K3nV	t	Administrador	573005996359@s.whatsapp.net	sent	f	text	\N	\N	\N	\N	\N	\N	2026-07-16 19:41:46.740409	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	a5057b57-bfac-4536-9936-2430e8da5d9c
65f6f350-2e1d-4745-9ed4-afc07580bebe	3EB098B76FFF19F42A3FB1	enc:v2:Pd/kzICPPS0Wzf8TkwfrHUi+TkE4MhNjBpC3oxJPUvY=:lyBx0vWBRI00me3M:wsMBAeABwZ02j84OtgqDQQ==:ebtC5pJPZ7haRO8Ydt3Cwot6dusk7RYXWx1QVcZkXWAdlCJCYEqoOe2bd0WcO0I=	f	Innova Cloud	103676366569665@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 15:17:12.0632	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
d7c7dfdc-3b8a-461b-a02d-f4754ce9d227	3EB06F76620B3F8AC286B5	enc:v2:CPBc5PKRUo9TDPHzmM36tx9tQXNcNGiBXKZd8EUpCGA=:iG38YE3eEkymdmoV:Nu1w3/0wPhynxQ399vw9RQ==:KoMn	t	Administrador	573052019345@s.whatsapp.net	sent	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 15:17:17.276452	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	a5057b57-bfac-4536-9936-2430e8da5d9c
0e9e8dbe-a3a0-41ce-bab0-46367bd9d193	AC88A55780F9D9F54406703C02FBD2A3	enc:v2:pevbM9MX/UTstRLsKqyZ8IM0U6FulabEoNN1BPFMvXA=:9z87uhcR4Aj++2ow:FONv/nKjkwYtPTE2Dp28hA==:2a25ktHggt4c+AHXx5c=	f	Raquel	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 15:17:19.408387	d2275ad5-ce5e-4d59-8c5b-a702665f5dc6	\N
435b306a-71ae-4919-b9f0-a338dffd3bea	3EB06772C71E8292593995	enc:v2:Mz7V1A//zt9TWaxSfb2f7fwEGAd4zoZLiqONqzngf2Y=:zS8yD5FUVVZ1YPYC:k0FlerOJH7ips7iUgocVvw==:JiAnMj+a1xx26nTawLY66IFcwBFa3IF0NMwjbKJgssWJnOuDG+zTFow28wc5N1jC88rcfyvfXmCth9QRJMIHnB9nzZAvROopbOg=	t	Sistema	573052019345@s.whatsapp.net	sent	t	text	\N	\N	\N	\N	\N	\N	2026-07-17 15:17:19.918335	d2275ad5-ce5e-4d59-8c5b-a702665f5dc6	\N
4ed19ae8-8171-41cb-9d3e-8e9d997d7163	3EB03D4487500C2D54307E	enc:v2:85EnX/ISlo9eoOjkeIhDI42Eh5kUCSKihShyK9EWe4E=:g8NH1sphEny1/ISk:VXyu3n9Y4sFLI9g5WohRow==:W4Si6w==	f	CLOUD TECHNOLOGYS CENTER	215873730129958@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 15:17:24.556604	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
9ad7b0a0-8ae1-402b-8712-3b8640f02858	3EB025789B85192B346A3E	enc:v2:WpvrFyYWT76KJUUqvgVUrPbrWNfCkDrrWPWtRhwdwws=:ePHvKiH5ya6wei3B:EFwqbzQFBK3OgGU21pmNJA==:7hO7sUUEdXOBAEGZsCPJLIZYdctuqoon	f	CLOUD TECHNOLOGYS CENTER	215873730129958@lid	delivered	f	image	3EB025789B85192B346A3E	http://localhost:3001/uploads/whatsapp/1784309151181-784249156.jpg	image/jpeg	image-3EB025789B85192B346A3E.jpg	14201	\N	2026-07-17 17:25:50.249085	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
fdb53b10-15a1-49c9-b5bd-669d95a8f512	3EB0038A2A731F9359C0EF	enc:v2:FelEwCQfQomLWrn4w5HlvT67ftHrtMZfUXWCLUYViCU=:IdDHWUJP0ueMC1p1:O8sk+pG5siQ3qB8fp2gtcg==:tvLG5cdfahbKU/yVQy2zCpJSRA==	f	Agente de Soporte Jorge arroyo	33247912284290@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 17:26:16.988711	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
34759977-f013-4930-a92b-f0d29910691c	3EB066949C0CC48AD09258	enc:v2:OE/9W3s+UXcGOVwwSWr22n9QbVZuNsCHRJX2AUCUu50=:OCWX54N8eELnEHJj:cXudUe6cQ4flNv9ubiU6cA==:qYKL8wo=	f	CLOUD TECHNOLOGYS CENTER	215873730129958@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 17:26:56.222303	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
f70a7d72-41e0-42c0-887f-08b5d29bc6c6	3EB01CDA36E4DFDDFC464C	enc:v2:26u8+Xi/kNk6ozYVj8WHznAYHQCEjueTe9IIrgAvQsA=:mYr36PMwHEnZUhAO:i6/DMj7VpcxbxvBaSo3t1Q==:u7+Z/TadCyaOByVkWXFa2DWtqMElGvFXyg==	f	CLOUD TECHNOLOGYS CENTER	215873730129958@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 17:27:04.015755	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
115f8631-54ea-41c6-bd91-578c795023fc	3EB0A80696702047BFFC	enc:v2:hbMzFgawHDaGZRZJ51yaUl30Ei2QTA//H/qy+nkHUS8=:w1oMZXy54BHfzkbV:GMZb9QIeWlDHp0EBDKbWlw==:gSRog2ymWZPA96voieNFQyWoeamYFvHeCiDqX3e8HqQ=	f	CLOUD TECHNOLOGYS CENTER	215873730129958@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 17:27:12.63222	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
a69952a8-e2e6-413a-8525-ef605ab5ff92	A5159AC618CCD64DA77925ECCEA979FB	enc:v2:Lah7GSKQ55a6/q9oJdMy9IOuXlIJZYyueOrPn1cQjyU=:oVT/qpSowZf2E4h0:sBh1sNVzJc5agUap7+pH9w==:b2qz+BVhSWkT3xdhdhsoqKgarKBNZImO7Iz3MRIOhxViw7g=	f	Innova Cloud	233246906396733@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 17:38:17.594727	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
72b3f93f-cde7-41e6-8603-eaaeff190593	3EB0069E467914E70A245B	enc:v2:nZyGswIyHkuCSQXmFDQFjFFBWo2TXtW2XmeFDfFlFKo=:1HCZi012FFju7/1I:IKYFmroHE/engSZy5WEAmg==:VwTs	t	Administrador	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 19:34:36.741664	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	a5057b57-bfac-4536-9936-2430e8da5d9c
31577208-d4b5-4b2c-8415-8ae3feafedab	3EB00D392EC05E61BF0A38	enc:v2:FJzdvm+q8VyF3FItzbH0nsJQXHXhDoz1UfghmvcWS8w=:QTmfZmbRKHdFOpft:fJHhxfjP0RJmF/LS8wp9vg==:HQ==	t	Administrador	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 19:34:24.580373	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	a5057b57-bfac-4536-9936-2430e8da5d9c
ac7d8648-5408-46ea-98b9-9ba6cd85314e	3EB0CAA2145D08F934AC24	enc:v2:S2eVcFrCm54OKmwFNcd+nqVMOg3VmnF+6JIIDJs/ZIs=:AnlezRk+3wZu7OBN:vNYQ5bm0nwDStomKK7tj8A==:iTaerw==	t	Administrador	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 19:34:29.665688	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	a5057b57-bfac-4536-9936-2430e8da5d9c
1f433563-ec50-4779-93e6-c6f8e05dabc6	3EB005034C17845B7AA6F4	enc:v2:wRtFMJpRUDPyWl2OhCmcLiZMmzFuCNq6s0KyYuyAeQo=:Yt93Q0uw5/vB0NLH:7nuArRUj+79vycoexP+boQ==:frt0	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 19:35:49.025485	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
410077d6-0259-4985-a361-f69d1340add3	3EB0D1C06F1956C3E649CB	enc:v2:4OBAwX5E0rouUtr9cBIizATLLuWzKQWn5I3IzvAGPyI=:31WslICmwNS8I9oA:ZDS6EeTjd9uSUK7K601T9w==:XQB6ExLI	t	Administrador	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 19:35:02.657049	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	a5057b57-bfac-4536-9936-2430e8da5d9c
fffd3f4d-8d2e-4aed-b464-27156523fa16	3EB04C2D9A7E25BECC341A	enc:v2:n5V9jURIDSborn/J+GuncRN19Tz5RtHu5VGlCOXmWgI=:ur0kfRBjjJbg3yHV:8KV9Xi7V1+D4qM9iJksmKQ==:EXOa	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 19:35:51.826543	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
526805d0-00b5-495a-be24-a6b641048601	3EB0235B16A8D521E7F777	enc:v2:yPtUiUOs+BkDAI3GD8RCwKQFigd3vSJLCav7AZ14ku8=:T9CXqxvv6Tx99VkK:9CoCb9hcZtUJGhdQy73/fQ==:8fzKuiK3+Jbyrc5sCE2LIyJw1l5We1o+zfTPbJuiDG+SNeaVxeVeLN3JDCnFHEP1T0zNRWNycyof7lt54eIL87YOvp+KtjLbhJtSpBg=	t	Andres Sapta	573005996359@s.whatsapp.net	failed	t	text	\N	\N	\N	\N	\N	\N	2026-07-17 19:38:24.271539	d2275ad5-ce5e-4d59-8c5b-a702665f5dc6	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
e493c906-1b23-4c4c-88b3-9d2fedf6aa54	3EB0C01A89981D80871C1D	enc:v2:sxskvamz/xHt47c66ROxxpjOD3INEQjxYTYhxA+XVwI=:WLwcDEWJjPOlhOOE:+x7Ncx6ccVKMVRElvC/3Lg==:tss/0A==	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 19:37:22.230933	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
b94a2b29-31d7-4e70-9c47-8d31abb522be	3EB09BE14E0F7969E0A5B0	enc:v2:ZFTxbQ0LVtJCbQ8ISTa8zzX9cIE4Rrg4dAJ/k+uQhRk=:j6rB4Zd95X6lvxzx:UsM9zCBrwXzYsXUQXQVuYw==:IXRMKBA=	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-17 19:35:54.683027	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
b0173476-7ab6-43d2-9a10-99a50fc260e9	3EB07E7254D533A58B639A	enc:v2:YUwNHgDHVbw1rRJbvstkJQY7jR2z9I9Fm2zBSrKt+mY=:UTA5ERjYX+R4k/eV:FGIow0qR0aX/iTPoIRns+g==:acgr	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:13:53.771163	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
029d821c-b969-459d-a869-07dbfab6c09e	3EB0144B4BC7471C349C09	enc:v2:JSuo8KJOoSbeoa0aywitvTHg/9cOi7kiPGLMhEDGXOA=:gl8mNNkOY0qzYfJ1:jcs8rNtfy/v3JqPScINvOw==:sS0O	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:13:29.745273	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
e1c9e98a-63ff-44b9-881e-8fb715bc8dd1	3EB0E6B1C8EFBF55288F63	enc:v2:6gl5GFgw0P3b7++68aJJJXnptFVX0UgzDLcArMgtFa8=:tiJvhrhdD/TYbFaB:ELi4YeODtiqQKhA1Yx8YtA==:xpKJWbHfBQ==	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:13:32.816146	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
b9d1b2ac-7847-4ce9-bc5f-2d10bf35fa8d	3EB00710302BA5CA133B75	enc:v2:a+a+Mz08MxwF0JQJlUa6XMXEC+bXQTG6BmJRzZHYvuY=:11uIgUirmNx1yv2R:BWiNl1qY8AYMF+qoe6ZyVA==:Ctxl	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:13:56.439992	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
7f7bc396-030f-4c66-aa9d-831d120332aa	3EB057A43D79DB3FC6E62C	enc:v2:GH+J68/hkMRy0CmSkOCtvHtGHdgDe1qookEDMEXBAgk=:I+fw6vAOTjV4Nr9f:yKxR0enqQyrSPea37Kd4fQ==:Mrdo	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:14:11.474993	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
1904de08-5adf-40ef-8b50-a289a4853582	3EB02F8CA157845DEFB303	enc:v2:1H92aenIysvL4IMGfDPZBfM2qHFTMq0bJP9HXb8W9Fc=:xP2GquqHpmtDBcjG:kebwXZdOXEXv1XCoW2aJcw==:pyF+HNJJx/YLchgNLO4iJEFZz6XlY6yuThAyqq+FoWYY1C8=	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:14:22.575965	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
5153f7ff-9bb3-4c67-a229-24609ea3c8e0	3EB0682F7511D5B033934F	enc:v2:t3fC831aMeZnprTkTCv+uX3UtLELDGjeXnbILTcLoRc=:4jMcrYWhXE2UlZBO:11C0U4TJ03p5gufgiUqltw==:ZxYfH1kzVA==	t	Administrador	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:18:13.373843	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	a5057b57-bfac-4536-9936-2430e8da5d9c
77b330fb-00d1-4dae-930e-0f2d11eb4cda	3EB065EBA9002D348A3E12	enc:v2:IGNJlxqv68BVEXd+RzmMzOSgXNN+Qxy1wrnCNd3TbkE=:4bVomqZM9TDzHEZf:XyBuWb38xw+DFS+sKY4rOA==:6oM/AQ==	t	Administrador	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:18:17.285943	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	a5057b57-bfac-4536-9936-2430e8da5d9c
778930cc-09b5-4fef-9eba-d4156ba3c16a	3EB009AACAD8DC29CC8203	enc:v2:88qdX46+KGoHj9Yc19dXzZtMxNw8PJT6ILLCLtC+/Nc=:BTInBFVdcwQK5p/a:yJ3wX6GCib86nnzuTOE8bA==:Ai14hrtFaWcsw1Y7ub5xAy+pupQZk6ED+HVeb+ZbxSzVIU+xlK+s1we0TiVRsxx3WJmF	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:31:08.568261	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
6087a7fb-ea41-4c9e-a938-f941bd9dea22	AC4CA92AF8154D57CF6ABCA538119168	enc:v2:vOSe7DXyw8326y4Lp9RkceupT5VnBAp/NKDjcU1OY9s=:Qo0pCXzDeWWpk86I:4ONnqAsc61OuGVwlHBEqhA==:2T4r8Q==	f	Jean Munoz	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:32:31.398656	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
88537039-1242-4e8d-b7ff-7ccf74f00673	3EB04D23A25899779C10DB	enc:v2:avYpLr3Mjh2IqXrdtNwOULYLFOPyvX3EtSSsx7zi2t8=:kyjLB5tBMH/cVGO4:fxoyjVj+Hqvp2qjjh9lcxQ==:QNSr9Oo3snr+mYxRkJzfW4dFsjcDPGmOO1Mn/c/e55Ol6i5Nl5tMCv+62gwnuyZO/wiSV4HwE6MPexT8a/ZwT9duzDyvIqGPM3YAeXI=	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:32:31.462457	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
2faf60af-0301-4863-9e47-49f725911c7f	AC55BC00AD95C4573EDC32995E71A2DC	enc:v2:UZiawjhJe+OCimfrSD3PWWIoaTsPLjVFTZnY1NTPYUU=:V9LWvs6BFsozCbR5:l7hfLkxL8Xja7E7+HUyxvQ==:fGFh	f	Jean Munoz	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:32:44.42446	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
4db332d1-b2d2-4247-b704-604ca276b607	3EB0E8026647A16F5396D1	enc:v2:93jR+7grpBjnryRLPoBWIgw5nLE9329wSWrUCFurQqQ=:VQa/iervCDGBXvog:FAGcZDth81k8xbcOOL3fTg==:IT+esnx7n3vHjNa7wGl42GN/yRd+kEiwnI9U+Oia9pYxADql9S4sa3XfyH1BkDvJoNKtmg7WFtOGR295b+cfFJWM+xPf2NHk+zU=	t	Sistema	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:32:44.511571	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
eef44f7f-4656-48a8-b95b-9a5e407b0c9b	AC0846B1C56BE099CF0D128DE92844EC	enc:v2:98O793G08ORSjTUhm2CfpFE+x+4ZxLOvME5BsD0/tek=:o0eKxx/jX1tx7KA2:1BsZUE8d2z3/RrHKAKr45w==:8XAMBT0=	f	Jean Munoz	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:32:47.569453	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
9ab73ac9-fb81-4f1b-96b5-02e765cc8382	AC2252474A97A8DAED2493CCD02C4050	enc:v2:g4VhHFtlk6b9blHdHFF8H1wOvr7Ul+mKBtyqBqdDqRk=:7pyzTGofEle07Fjq:g/50Vw8oxAOaFAFVYLQZBg==:5iQs	f	Jean Munoz	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:32:49.529885	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
17ab8c46-7cc0-4303-afcf-e3eaa8de47b3	3EB0AE5094D7F56F651ACD	enc:v2:5sCnl8svj1MG8j+0oK83wNRtImT7ZTbnlfB+B0fAz8U=:wsyNu2/eZkBgLLF3:ZSOh3xGJok7ZClDfTWPkGw==:JIjP7C+yLRHZ9R57YUD31zlrTssQl2+iisfbvbcMDwmfMij2YssQ3n4bnYcA14vvTIKgWK0+ljI4y/vz8veuxCqPd3Ro0bdIOTGppNg=	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:33:10.44129	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
84e7b94d-e2ea-4175-af62-28045e45f412	3EB0BD600B2D5AC39ECC65	enc:v2:STpwrTTgGJ7s+Pxo00VztcckJe3X4PuLgGKlteD0Jdc=:yNLsh6aRZpuO8ytL:8yTm3unALgr3GXrY6bbCsQ==:aPXlq22v	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:33:17.682123	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
413c0bc3-e4a6-4699-bf18-5da5772c1490	3EB0305210BBC600255F00	enc:v2:+695kZtxSz/AqACdsM1QIC01Sl12pSo7v5M/vuD8y3A=:wAnOvsnQgcjzvERZ:Vx1bzon0u7KhUcy26+DmKw==:C9YvZRiZEIUQJ6DL70XNUdYZE48k4VhLS99QFTsDDUHGWgUy3DJaL6XKjKx//lUkYr0kgbE9KuhJvDSHHF5kQc7/7Ascd4Lebe+b+DtMqOMQwPqQAvbgiyMCXqUy5GhHVq3cFXfp6Gt/Y9E/VEUDTBxqMRIKEKJlqtQcZhyLniJ0JQ==	f	aux ad	207795030859910@lid	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 12:57:15.349158	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
d450c894-469c-44e5-889d-62beb4b06955	3EB0DF6C305D3CB5B478A4	enc:v2:g0MrW422W6OfIxi1BJdJ66fJ5xM1KNBcWu8+BeR1sY0=:uDFkuQyPxyThIcj3:lBBoIc4SiKdg/9ctkbteQw==:YG/BQQ==	f	Soporte Eduardo Barros	87819481546902@lid	delivered	f	reaction	3EB0305210BBC600255F00	\N	\N	\N	\N	\N	2026-07-21 12:57:45.208049	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
3abc342b-6f2d-4fef-8697-980a143de42c	3EB098F98E24C30DC619F9	enc:v2:bfCDBBAEogqy+SuTJ7oVI3iOWgaWh14UElrD2zAX6I4=:1DMKJ6GN252f1INc:xUxKtYmOdsGBMxH52ICugg==:I7nDWw==	f	Innova Cloud	103676366569665@lid	delivered	f	reaction	3EB0305210BBC600255F00	\N	\N	\N	\N	\N	2026-07-21 12:57:58.092242	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
b042d418-2e26-4227-b8c1-f0947c397370	3EB0A257F930B26C296640	enc:v2:z033eFz4SC1zusAWciyr1jWxVVvRbL/slPf2lcPP7/I=:MSt4kI5VzMnwmY9V:QJPbVSjWazZYLyWGJhGNBQ==:+c6vIA==	f	Michell Sollangie	47927674314848@lid	delivered	f	reaction	3EB0305210BBC600255F00	\N	\N	\N	\N	\N	2026-07-21 12:58:15.774907	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
fbad032c-87c2-4111-adeb-f6770fb2227c	3EB02F627EA0C3A360F1BD	enc:v2:dUSD5w5+V/j6V6Ss/DxYNOoIV82jLE+jQtXFkYBjIVo=:Pk1RHVOpxJnfmHA3:52smV/AntxQEZzh2gyfJnA==:4kYvCQ==	f	Agente de Soporte Alvaro Yepes	40712263479465@lid	delivered	f	reaction	3EB0305210BBC600255F00	\N	\N	\N	\N	\N	2026-07-21 12:58:32.501288	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
c91022a4-6267-493d-b46f-f7e800a6dbfc	3EB0F2A1FF8CCBE586E54C	enc:v2:cuTjGSbWSTbkS+tQBmt8IUsqmvRqxa7cZ7dmV15aOes=:uiIly6e92F32XecY:Be0dmcUZ7y5uAEvaNbXGKA==:n6pQVg==	f	Innova Cloud	148567800967258@lid	delivered	f	reaction	3EB0305210BBC600255F00	\N	\N	\N	\N	\N	2026-07-21 12:59:54.279266	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
89e1aaf5-40d7-4be4-bc26-7827e8986cab	AC11B1C61EB888B5B4B543BBA4D7162D	enc:v2:ZVloc2d2e/ydxNIjOILaDhXN+j202/U9g++2h3hXaXw=:VW1w8A+sbOM+nvN4:6aP8vcOWrFKx4nlmWFR3Fg==:gSEJLa5P	f	Jean Munoz	\N	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 13:22:18.966629	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	\N
5edf4d9f-7a5b-434d-87b4-c24d133ef4ee	3EB0102BA8649A28662894	enc:v2:278YEFqHRB9wMFQlkaJ6qdLfLDVHwvdc7XJ4uOctQRg=:68WWC4/Ormm8DRCA:fUZdbYbm6V0FNFtwdFnauA==:H9Z8Cw78t1WYE2qNlsy3dqh5Dv/1Swrvx6PkqikYX3UqsIBri3Z4vQ63uIeTDXiDx2m+XuA+ef9qkbsFGgvt5MkaqhyNMm81e4lfKw8=	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	t	text	\N	\N	\N	\N	\N	\N	2026-07-21 13:22:19.202668	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
d7229eed-6cdc-44be-8a22-35e69dfc6a41	3EB009530BC8187A7853B9	enc:v2:uClDAK+xnSxoq34spj+n0x2bYsloI23x3fUIo5qiSGA=:/SgRHl9D5S2c7ya5:AgU0zLDgLpUTax1uDivcOg==:s1Y2s/Q=	t	Andres Sapta	573005996359@s.whatsapp.net	delivered	f	text	\N	\N	\N	\N	\N	\N	2026-07-21 13:22:28.451449	e2cdf27e-8c6a-4a5d-9f56-6e5cd655a857	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be
a6d8b5c3-a86f-414f-92d4-0e6d0c7b1806	local-reaction:3EB0305210BBC600255F00:8c25b4a0-4bba-41f6-bf3e-2111a5ad77be	enc:v2:5cOD5IbdY7RoGp6DRuHSuJyw8gnchpmlRV33RBW5QtQ=:F4vtmQuvKeZTR7aL:bkSd/gZeaCKluS/lFbKFuA==:Y9jk	t	Andres Sapta	8c25b4a0-4bba-41f6-bf3e-2111a5ad77be	sent	f	reaction	3EB0305210BBC600255F00	\N	\N	\N	\N	\N	2026-07-21 13:23:17.633417	a18b343f-61d4-43d6-b7a1-7ee1cd1c69aa	\N
\.


--
-- Data for Name: widget_config; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.widget_config (id, color, posicion, forma, tamano, icono, texto_boton, mostrar_texto, abrir_automatico, delay_auto_abrir, mensaje_burbuja, mostrar_burbuja, titulo_panel, subtitulo_panel, chat_url, chat_header_color, chat_bg_color, chat_bubble_color, chat_bubble_user_color, chat_marca, created_at, updated_at) FROM stdin;
c3ca868c-262a-4561-8288-a1eed3a220f2	#2563eb	top-left	rounded	sm	support		f	f	5	┬┐Necesitas ayuda? ┬íChatea con nosotros!	t	Soporte en l├¡nea	Estamos aqu├¡ para ayudarte	https://ia.innovacloud.co	#0891b2	#faf5ff	#eff6ff	#7c3aed	Soporte en l├¡nea	2026-07-13 16:53:21.2104	2026-07-16 20:55:46.575176
\.


--
-- Name: faqs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.faqs_id_seq', 3, true);


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
-- Name: idx_faqs_activo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_faqs_activo ON public.faqs USING btree (activo);


--
-- Name: idx_faqs_categoria; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_faqs_categoria ON public.faqs USING btree (categoria);


--
-- Name: idx_faqs_colegio_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_faqs_colegio_id ON public.faqs USING btree (colegio_id);


--
-- Name: idx_faqs_orden; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_faqs_orden ON public.faqs USING btree (orden);


--
-- Name: idx_messages_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_session_id ON public.messages USING btree (session_id);


--
-- Name: idx_messages_session_id_created_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_messages_session_id_created_at ON public.messages USING btree (session_id, created_at);


--
-- Name: idx_ratings_session_id; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_ratings_session_id ON public.ratings USING btree (session_id);


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

\unrestrict KWLzzJi1d2QJclJv6vUC0ZpKboSbtwGF8nPLWnAd8NGp8ApzgYDP4EZ6egYbcBg

