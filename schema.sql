--
-- PostgreSQL database dump
--


-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

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

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: account_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.account_roles (
    id integer NOT NULL,
    account_id integer NOT NULL,
    role_id integer NOT NULL
);


--
-- Name: account_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.account_roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: account_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.account_roles_id_seq OWNED BY public.account_roles.id;


--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    password_hash text NOT NULL,
    first_name character varying(100) NOT NULL,
    last_name character varying(100) NOT NULL,
    phone character varying(50) DEFAULT ''::character varying,
    birthdate date,
    tax_id character varying(50) DEFAULT ''::character varying,
    street_address_1 character varying(255) DEFAULT ''::character varying,
    street_address_2 character varying(255) DEFAULT ''::character varying,
    country character varying(100) DEFAULT ''::character varying,
    city character varying(100) DEFAULT ''::character varying,
    state_province character varying(100) DEFAULT ''::character varying,
    zip_postal_code character varying(20) DEFAULT ''::character varying,
    profile_complete boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    language character varying(10) DEFAULT 'en'::character varying NOT NULL
);


--
-- Name: accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.accounts_id_seq OWNED BY public.accounts.id;


--
-- Name: api_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.api_tokens (
    id integer NOT NULL,
    account_id integer NOT NULL,
    name text NOT NULL,
    prefix text NOT NULL,
    token_hash text NOT NULL,
    last_used_at timestamp without time zone,
    expires_at timestamp without time zone,
    revoked_at timestamp without time zone,
    created_at timestamp without time zone DEFAULT now() NOT NULL
);


--
-- Name: api_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.api_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: api_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.api_tokens_id_seq OWNED BY public.api_tokens.id;


--
-- Name: app_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.app_settings (
    key character varying(100) NOT NULL,
    value text DEFAULT ''::text NOT NULL,
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    folder_path character varying(1000) DEFAULT ''::character varying NOT NULL,
    owner_type character varying(20) NOT NULL,
    account_id integer,
    entity_id integer,
    file_name character varying(500) NOT NULL,
    stored_path character varying(1000) NOT NULL,
    mime_type character varying(200) DEFAULT ''::character varying,
    size_bytes integer DEFAULT 0 NOT NULL,
    uploaded_by integer,
    created_at timestamp without time zone DEFAULT now(),
    CONSTRAINT document_owner_xor CHECK (((((account_id IS NOT NULL))::integer + ((entity_id IS NOT NULL))::integer) = 1))
);


--
-- Name: documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documents_id_seq OWNED BY public.documents.id;


--
-- Name: entities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entities (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    entity_type character varying(50) DEFAULT 'LLC'::character varying NOT NULL,
    date_established date,
    currency character varying(20) DEFAULT 'USD ($)'::character varying,
    tax_id character varying(50) DEFAULT ''::character varying,
    ownership_allocation character varying(20) DEFAULT 'percent'::character varying,
    country character varying(100) DEFAULT ''::character varying,
    street_address character varying(255) DEFAULT ''::character varying,
    street_address_2 character varying(255) DEFAULT ''::character varying,
    city character varying(100) DEFAULT ''::character varying,
    state_province character varying(100) DEFAULT ''::character varying,
    zip_postal_code character varying(20) DEFAULT ''::character varying,
    disbursement_method character varying(20) DEFAULT 'wire_transfer'::character varying,
    bank_name character varying(255) DEFAULT ''::character varying,
    bank_address text DEFAULT ''::text,
    bank_routing_number character varying(50) DEFAULT ''::character varying,
    bank_swift_code character varying(20) DEFAULT ''::character varying,
    bank_account_number character varying(50) DEFAULT ''::character varying,
    bank_account_name character varying(255) DEFAULT ''::character varying,
    for_further_credit_to character varying(255) DEFAULT ''::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now()
);


--
-- Name: entities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.entities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.entities_id_seq OWNED BY public.entities.id;


--
-- Name: entity_managers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_managers (
    id integer NOT NULL,
    entity_id integer NOT NULL,
    account_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: entity_managers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.entity_managers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entity_managers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.entity_managers_id_seq OWNED BY public.entity_managers.id;


--
-- Name: entity_owners; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.entity_owners (
    id integer NOT NULL,
    entity_id integer NOT NULL,
    owner_type character varying(20) DEFAULT 'account'::character varying NOT NULL,
    owner_account_id integer,
    owner_entity_id integer,
    ownership_percent numeric(7,4) DEFAULT 0,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: entity_owners_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.entity_owners_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: entity_owners_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.entity_owners_id_seq OWNED BY public.entity_owners.id;


--
-- Name: organization_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_invites (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    token character varying(64) NOT NULL,
    used boolean DEFAULT false,
    used_by_account_id integer,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: organization_invites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.organization_invites_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: organization_invites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.organization_invites_id_seq OWNED BY public.organization_invites.id;


--
-- Name: organization_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_members (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    account_id integer NOT NULL,
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    invite_id integer,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: organization_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.organization_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: organization_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.organization_members_id_seq OWNED BY public.organization_members.id;


--
-- Name: organization_organizers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organization_organizers (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    account_id integer NOT NULL,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: organization_organizers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.organization_organizers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: organization_organizers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.organization_organizers_id_seq OWNED BY public.organization_organizers.id;


--
-- Name: organizations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.organizations (
    id integer NOT NULL,
    name character varying(255) NOT NULL,
    description text DEFAULT ''::text,
    website character varying(255) DEFAULT ''::character varying,
    logo_url character varying(500) DEFAULT ''::character varying,
    country character varying(100) DEFAULT ''::character varying,
    city character varying(100) DEFAULT ''::character varying,
    state_province character varying(100) DEFAULT ''::character varying,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    slug character varying(255) NOT NULL
);


--
-- Name: organizations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.organizations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: organizations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.organizations_id_seq OWNED BY public.organizations.id;


--
-- Name: password_reset_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.password_reset_tokens (
    id integer NOT NULL,
    account_id integer NOT NULL,
    token character varying(255) NOT NULL,
    expires_at timestamp without time zone NOT NULL,
    used boolean DEFAULT false,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.password_reset_tokens_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: password_reset_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.password_reset_tokens_id_seq OWNED BY public.password_reset_tokens.id;


--
-- Name: roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.roles (
    id integer NOT NULL,
    name character varying(50) NOT NULL,
    description text DEFAULT ''::text
);


--
-- Name: roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.roles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.roles_id_seq OWNED BY public.roles.id;


--
-- Name: session; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.session (
    sid character varying NOT NULL,
    sess json NOT NULL,
    expire timestamp(6) without time zone NOT NULL
);


--
-- Name: spv_asset_valuations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spv_asset_valuations (
    id integer NOT NULL,
    asset_id integer NOT NULL,
    date date NOT NULL,
    value numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    note text DEFAULT ''::text,
    created_at timestamp without time zone DEFAULT now()
);


--
-- Name: spv_asset_valuations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.spv_asset_valuations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spv_asset_valuations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.spv_asset_valuations_id_seq OWNED BY public.spv_asset_valuations.id;


--
-- Name: spv_assets; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spv_assets (
    id integer NOT NULL,
    spv_id integer NOT NULL,
    company_name character varying(255) NOT NULL,
    instrument_type character varying(100) DEFAULT 'Equity'::character varying NOT NULL,
    purchase_date date,
    cost numeric(15,2) DEFAULT '0'::numeric NOT NULL,
    notes text DEFAULT ''::text,
    created_at timestamp without time zone DEFAULT now(),
    is_default boolean DEFAULT false NOT NULL
);


--
-- Name: spv_assets_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.spv_assets_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spv_assets_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.spv_assets_id_seq OWNED BY public.spv_assets.id;


--
-- Name: spv_members; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spv_members (
    id integer NOT NULL,
    spv_id integer NOT NULL,
    account_id integer,
    created_at timestamp without time zone DEFAULT now(),
    committed numeric(15,2) DEFAULT 0,
    distributed numeric(15,2) DEFAULT 0,
    date date,
    entity_id integer,
    management_fee numeric(15,2) DEFAULT '0'::numeric,
    ownership_percent numeric(7,4),
    other_fee numeric(15,2) DEFAULT '0'::numeric,
    total_called numeric(15,2) DEFAULT '0'::numeric,
    carry numeric(5,2) DEFAULT '0'::numeric,
    CONSTRAINT spv_member_investor_xor CHECK (((((account_id IS NOT NULL))::integer + ((entity_id IS NOT NULL))::integer) = 1))
);


--
-- Name: spv_members_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.spv_members_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spv_members_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.spv_members_id_seq OWNED BY public.spv_members.id;


--
-- Name: spvs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.spvs (
    id integer NOT NULL,
    organization_id integer NOT NULL,
    legal_name character varying(500) NOT NULL,
    display_name character varying(255) NOT NULL,
    entity_type character varying(50) DEFAULT 'LLC'::character varying,
    state_of_incorporation character varying(100) DEFAULT ''::character varying,
    ein character varying(20) DEFAULT ''::character varying,
    date_established date,
    date_ended date,
    allocation_method character varying(100) DEFAULT 'By Commitment'::character varying,
    currency character varying(10) DEFAULT 'USD ($)'::character varying,
    management_fee_percent numeric(5,2) DEFAULT 0,
    carried_interest_percent numeric(5,2) DEFAULT 0,
    preferred_return_percent numeric(5,2) DEFAULT 0,
    country character varying(100) DEFAULT ''::character varying,
    street_address character varying(255) DEFAULT ''::character varying,
    street_address_2 character varying(255) DEFAULT ''::character varying,
    city character varying(100) DEFAULT ''::character varying,
    state_province character varying(100) DEFAULT ''::character varying,
    zip_postal_code character varying(20) DEFAULT ''::character varying,
    county character varying(100) DEFAULT ''::character varying,
    manager_id integer,
    signatory_id integer,
    bank_name character varying(255) DEFAULT ''::character varying,
    bank_address text DEFAULT ''::text,
    bank_routing_number character varying(50) DEFAULT ''::character varying,
    bank_swift_code character varying(20) DEFAULT ''::character varying,
    bank_account_number character varying(50) DEFAULT ''::character varying,
    bank_account_name character varying(255) DEFAULT ''::character varying,
    for_further_credit_to character varying(255) DEFAULT ''::character varying,
    wiring_instructions text DEFAULT ''::text,
    investment_company_name character varying(255) DEFAULT ''::character varying,
    investment_type character varying(100) DEFAULT ''::character varying,
    total_being_raised numeric(15,2) DEFAULT 0,
    minimum_investment numeric(15,2) DEFAULT 0,
    expected_closing_date date,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    auto_deploy boolean DEFAULT false NOT NULL
);


--
-- Name: spvs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.spvs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: spvs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.spvs_id_seq OWNED BY public.spvs.id;


--
-- Name: account_roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_roles ALTER COLUMN id SET DEFAULT nextval('public.account_roles_id_seq'::regclass);


--
-- Name: accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts ALTER COLUMN id SET DEFAULT nextval('public.accounts_id_seq'::regclass);


--
-- Name: api_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens ALTER COLUMN id SET DEFAULT nextval('public.api_tokens_id_seq'::regclass);


--
-- Name: documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents ALTER COLUMN id SET DEFAULT nextval('public.documents_id_seq'::regclass);


--
-- Name: entities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entities ALTER COLUMN id SET DEFAULT nextval('public.entities_id_seq'::regclass);


--
-- Name: entity_managers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_managers ALTER COLUMN id SET DEFAULT nextval('public.entity_managers_id_seq'::regclass);


--
-- Name: entity_owners id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_owners ALTER COLUMN id SET DEFAULT nextval('public.entity_owners_id_seq'::regclass);


--
-- Name: organization_invites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites ALTER COLUMN id SET DEFAULT nextval('public.organization_invites_id_seq'::regclass);


--
-- Name: organization_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members ALTER COLUMN id SET DEFAULT nextval('public.organization_members_id_seq'::regclass);


--
-- Name: organization_organizers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_organizers ALTER COLUMN id SET DEFAULT nextval('public.organization_organizers_id_seq'::regclass);


--
-- Name: organizations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations ALTER COLUMN id SET DEFAULT nextval('public.organizations_id_seq'::regclass);


--
-- Name: password_reset_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens ALTER COLUMN id SET DEFAULT nextval('public.password_reset_tokens_id_seq'::regclass);


--
-- Name: roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles ALTER COLUMN id SET DEFAULT nextval('public.roles_id_seq'::regclass);


--
-- Name: spv_asset_valuations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_asset_valuations ALTER COLUMN id SET DEFAULT nextval('public.spv_asset_valuations_id_seq'::regclass);


--
-- Name: spv_assets id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_assets ALTER COLUMN id SET DEFAULT nextval('public.spv_assets_id_seq'::regclass);


--
-- Name: spv_members id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_members ALTER COLUMN id SET DEFAULT nextval('public.spv_members_id_seq'::regclass);


--
-- Name: spvs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spvs ALTER COLUMN id SET DEFAULT nextval('public.spvs_id_seq'::regclass);


--
-- Name: account_roles account_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_roles
    ADD CONSTRAINT account_roles_pkey PRIMARY KEY (id);


--
-- Name: accounts accounts_email_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_email_unique UNIQUE (email);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: api_tokens api_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_pkey PRIMARY KEY (id);


--
-- Name: api_tokens api_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: app_settings app_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.app_settings
    ADD CONSTRAINT app_settings_pkey PRIMARY KEY (key);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: entities entities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entities
    ADD CONSTRAINT entities_pkey PRIMARY KEY (id);


--
-- Name: entity_managers entity_managers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_managers
    ADD CONSTRAINT entity_managers_pkey PRIMARY KEY (id);


--
-- Name: entity_owners entity_owners_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_owners
    ADD CONSTRAINT entity_owners_pkey PRIMARY KEY (id);


--
-- Name: organization_invites organization_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_pkey PRIMARY KEY (id);


--
-- Name: organization_invites organization_invites_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_token_key UNIQUE (token);


--
-- Name: organization_members organization_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_pkey PRIMARY KEY (id);


--
-- Name: organization_organizers organization_organizers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_organizers
    ADD CONSTRAINT organization_organizers_pkey PRIMARY KEY (id);


--
-- Name: organizations organizations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organizations
    ADD CONSTRAINT organizations_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_pkey PRIMARY KEY (id);


--
-- Name: password_reset_tokens password_reset_tokens_token_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_token_key UNIQUE (token);


--
-- Name: roles roles_name_unique; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_name_unique UNIQUE (name);


--
-- Name: roles roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.roles
    ADD CONSTRAINT roles_pkey PRIMARY KEY (id);


--
-- Name: session session_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.session
    ADD CONSTRAINT session_pkey PRIMARY KEY (sid);


--
-- Name: spv_asset_valuations spv_asset_valuations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_asset_valuations
    ADD CONSTRAINT spv_asset_valuations_pkey PRIMARY KEY (id);


--
-- Name: spv_assets spv_assets_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_assets
    ADD CONSTRAINT spv_assets_pkey PRIMARY KEY (id);


--
-- Name: spv_members spv_members_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_members
    ADD CONSTRAINT spv_members_pkey PRIMARY KEY (id);


--
-- Name: spvs spvs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spvs
    ADD CONSTRAINT spvs_pkey PRIMARY KEY (id);


--
-- Name: IDX_session_expire; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX "IDX_session_expire" ON public.session USING btree (expire);


--
-- Name: account_roles_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX account_roles_unique ON public.account_roles USING btree (account_id, role_id);


--
-- Name: documents_account_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_account_idx ON public.documents USING btree (account_id);


--
-- Name: documents_entity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_entity_idx ON public.documents USING btree (entity_id);


--
-- Name: entity_manager_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX entity_manager_unique ON public.entity_managers USING btree (entity_id, account_id);


--
-- Name: org_member_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_member_unique ON public.organization_members USING btree (organization_id, account_id);


--
-- Name: org_organizer_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX org_organizer_unique ON public.organization_organizers USING btree (organization_id, account_id);


--
-- Name: organizations_slug_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX organizations_slug_unique ON public.organizations USING btree (slug);


--
-- Name: spv_asset_valuations_asset_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX spv_asset_valuations_asset_id_idx ON public.spv_asset_valuations USING btree (asset_id);


--
-- Name: spv_assets_spv_id_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX spv_assets_spv_id_idx ON public.spv_assets USING btree (spv_id);


--
-- Name: spv_default_asset_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX spv_default_asset_unique ON public.spv_assets USING btree (spv_id) WHERE (is_default = true);


--
-- Name: account_roles account_roles_account_id_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_roles
    ADD CONSTRAINT account_roles_account_id_accounts_id_fk FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: account_roles account_roles_role_id_roles_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.account_roles
    ADD CONSTRAINT account_roles_role_id_roles_id_fk FOREIGN KEY (role_id) REFERENCES public.roles(id) ON DELETE CASCADE;


--
-- Name: api_tokens api_tokens_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.api_tokens
    ADD CONSTRAINT api_tokens_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: documents documents_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: documents documents_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;


--
-- Name: documents documents_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.accounts(id) ON DELETE SET NULL;


--
-- Name: entity_managers entity_managers_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_managers
    ADD CONSTRAINT entity_managers_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: entity_managers entity_managers_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_managers
    ADD CONSTRAINT entity_managers_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;


--
-- Name: entity_owners entity_owners_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_owners
    ADD CONSTRAINT entity_owners_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;


--
-- Name: entity_owners entity_owners_owner_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_owners
    ADD CONSTRAINT entity_owners_owner_account_id_fkey FOREIGN KEY (owner_account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: entity_owners entity_owners_owner_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.entity_owners
    ADD CONSTRAINT entity_owners_owner_entity_id_fkey FOREIGN KEY (owner_entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;


--
-- Name: organization_invites organization_invites_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_invites
    ADD CONSTRAINT organization_invites_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: organization_members organization_members_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_members
    ADD CONSTRAINT organization_members_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: organization_organizers organization_organizers_account_id_accounts_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_organizers
    ADD CONSTRAINT organization_organizers_account_id_accounts_id_fk FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: organization_organizers organization_organizers_organization_id_organizations_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.organization_organizers
    ADD CONSTRAINT organization_organizers_organization_id_organizations_id_fk FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: password_reset_tokens password_reset_tokens_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.password_reset_tokens
    ADD CONSTRAINT password_reset_tokens_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: spv_asset_valuations spv_asset_valuations_asset_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_asset_valuations
    ADD CONSTRAINT spv_asset_valuations_asset_id_fkey FOREIGN KEY (asset_id) REFERENCES public.spv_assets(id) ON DELETE CASCADE;


--
-- Name: spv_assets spv_assets_spv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_assets
    ADD CONSTRAINT spv_assets_spv_id_fkey FOREIGN KEY (spv_id) REFERENCES public.spvs(id) ON DELETE CASCADE;


--
-- Name: spv_members spv_members_account_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_members
    ADD CONSTRAINT spv_members_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE CASCADE;


--
-- Name: spv_members spv_members_entity_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_members
    ADD CONSTRAINT spv_members_entity_id_fkey FOREIGN KEY (entity_id) REFERENCES public.entities(id) ON DELETE CASCADE;


--
-- Name: spv_members spv_members_spv_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spv_members
    ADD CONSTRAINT spv_members_spv_id_fkey FOREIGN KEY (spv_id) REFERENCES public.spvs(id) ON DELETE CASCADE;


--
-- Name: spvs spvs_manager_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spvs
    ADD CONSTRAINT spvs_manager_id_fkey FOREIGN KEY (manager_id) REFERENCES public.accounts(id);


--
-- Name: spvs spvs_organization_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spvs
    ADD CONSTRAINT spvs_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id) ON DELETE CASCADE;


--
-- Name: spvs spvs_signatory_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.spvs
    ADD CONSTRAINT spvs_signatory_id_fkey FOREIGN KEY (signatory_id) REFERENCES public.accounts(id);


--
-- PostgreSQL database dump complete
--


