create table public.ad_creative_bodies_text (
  body_text_id bigserial not null,
  body_text text not null,
  body_text_hash text null,
  page_id character varying not null,
  constraint ad_creative_bodies_text_pkey primary key (body_text_id),
  constraint ad_creative_bodies_text_body_text_hash_key unique (body_text_hash),
  constraint ad_creative_bodies_text_body_text_key unique (body_text),
  constraint ad_creative_bodies_text_page_id_fkey foreign KEY (page_id) references facebook_pages (page_id)
) TABLESPACE pg_default;

create index IF not exists idx_ad_creative_bodies_text_body_text_hash on public.ad_creative_bodies_text using btree (body_text_hash) TABLESPACE pg_default;

create index IF not exists idx_ad_creative_bodies_text_text on public.ad_creative_bodies_text using btree (body_text) TABLESPACE pg_default;

create table public.ad_creative_captions_text (
  caption_text_id bigserial not null,
  caption_text text not null,
  caption_hash text not null,
  page_id character varying not null,
  constraint ad_creative_captions_text_pkey primary key (caption_text_id),
  constraint ad_creative_captions_text_caption_text_key unique (caption_text),
  constraint ad_creative_captions_text_page_id_fkey foreign KEY (page_id) references facebook_pages (page_id)
) TABLESPACE pg_default;

create index IF not exists idx_ad_creative_captions_text_text on public.ad_creative_captions_text using btree (caption_text) TABLESPACE pg_default;

create table public.ad_creative_descriptions_text (
  description_text_id bigserial not null,
  description_text text not null,
  description_hash text not null,
  page_id character varying not null,
  constraint ad_creative_descriptions_text_pkey primary key (description_text_id),
  constraint ad_creative_descriptions_text_description_text_key unique (description_text),
  constraint ad_creative_descriptions_text_page_id_fkey foreign KEY (page_id) references facebook_pages (page_id)
) TABLESPACE pg_default;

create index IF not exists idx_ad_creative_descriptions_text_text on public.ad_creative_descriptions_text using btree (description_text) TABLESPACE pg_default;

create table public.ad_creative_titles_text (
  title_text_id bigserial not null,
  title_text text not null,
  title_hash text not null,
  page_id character varying not null,
  constraint ad_creative_titles_text_pkey primary key (title_text_id),
  constraint ad_creative_titles_text_title_text_key unique (title_text),
  constraint ad_creative_titles_text_page_id_fkey foreign KEY (page_id) references facebook_pages (page_id)
) TABLESPACE pg_default;

create index IF not exists idx_ad_creative_titles_text_text on public.ad_creative_titles_text using btree (title_text) TABLESPACE pg_default;

create table public.ad_images (
  image_id bigserial not null,
  image_url text not null,
  image_hash character varying(64) null,
  detailed_description text null,
  first_seen_at timestamp with time zone null default CURRENT_TIMESTAMP,
  page_id character varying not null,
  constraint ad_images_pkey primary key (image_id),
  constraint ad_images_image_hash_key unique (image_hash),
  constraint ad_images_image_url_key unique (image_url),
  constraint ad_images_page_id_fkey foreign KEY (page_id) references facebook_pages (page_id)
) TABLESPACE pg_default;

create index IF not exists idx_ad_images_hash on public.ad_images using btree (image_hash) TABLESPACE pg_default;

create table public.companies (
  company_id bigserial not null,
  name character varying(255) not null,
  website character varying(512) null,
  description text null,
  industry_id bigint null,
  value_propositions text null,
  usps text null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint companies_pkey primary key (company_id),
  constraint companies_website_key unique (website),
  constraint companies_industry_id_fkey foreign KEY (industry_id) references industries (industry_id) on update CASCADE on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_companies_industry_id on public.companies using btree (industry_id) TABLESPACE pg_default;

create index IF not exists idx_companies_name on public.companies using btree (name) TABLESPACE pg_default;

create trigger set_companies_timestamp BEFORE
update on companies for EACH row
execute FUNCTION trigger_set_timestamp ('updated_at');

create table public.company_logos (
  logo_id bigserial not null,
  company_id bigint not null,
  image_url text not null,
  alt_text text null,
  logo_type character varying(50) null,
  display_order integer null,
  uploaded_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint company_logos_pkey primary key (logo_id),
  constraint company_logos_company_id_fkey foreign KEY (company_id) references companies (company_id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_company_logos_company_id on public.company_logos using btree (company_id) TABLESPACE pg_default;

create table public.company_markets (
  company_id bigint not null,
  country_code character(2) not null,
  is_primary boolean null default false,
  constraint company_markets_pkey primary key (company_id, country_code),
  constraint company_markets_company_id_fkey foreign KEY (company_id) references companies (company_id) on update CASCADE on delete CASCADE,
  constraint company_markets_country_code_fkey foreign KEY (country_code) references countries (country_code) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

create table public.competitions (
  company_a_id bigint not null,
  company_b_id bigint not null,
  competition_level character varying(50) null,
  notes text null,
  last_updated timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint competitions_pkey primary key (company_a_id, company_b_id),
  constraint competitions_company_a_id_fkey foreign KEY (company_a_id) references companies (company_id) on update CASCADE on delete CASCADE,
  constraint competitions_company_b_id_fkey foreign KEY (company_b_id) references companies (company_id) on update CASCADE on delete CASCADE,
  constraint competitions_check check ((company_a_id < company_b_id))
) TABLESPACE pg_default;

create index IF not exists idx_competitions_company_b on public.competitions using btree (company_b_id) TABLESPACE pg_default;

create trigger set_competitions_timestamp BEFORE
update on competitions for EACH row
execute FUNCTION trigger_set_timestamp ('last_updated');

create table public.countries (
  country_code character(2) not null,
  name character varying(255) not null,
  constraint countries_pkey primary key (country_code),
  constraint countries_name_key unique (name)
) TABLESPACE pg_default;

create table public.facebook_ad_body_links (
  meta_ad_id character varying(255) not null,
  body_text_id bigint not null,
  constraint facebook_ad_body_links_pkey primary key (meta_ad_id, body_text_id),
  constraint facebook_ad_body_links_body_text_id_fkey foreign KEY (body_text_id) references ad_creative_bodies_text (body_text_id) on update CASCADE on delete RESTRICT,
  constraint facebook_ad_body_links_meta_ad_id_fkey foreign KEY (meta_ad_id) references facebook_ads (meta_ad_id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_facebook_ad_body_links_body_text_id on public.facebook_ad_body_links using btree (body_text_id) TABLESPACE pg_default;

create index IF not exists idx_facebook_ad_body_links_meta_ad_id on public.facebook_ad_body_links using btree (meta_ad_id) TABLESPACE pg_default;

create table public.facebook_ad_caption_links (
  meta_ad_id character varying(255) not null,
  caption_text_id bigint not null,
  constraint facebook_ad_caption_links_pkey primary key (meta_ad_id, caption_text_id),
  constraint facebook_ad_caption_links_caption_text_id_fkey foreign KEY (caption_text_id) references ad_creative_captions_text (caption_text_id) on update CASCADE on delete RESTRICT,
  constraint facebook_ad_caption_links_meta_ad_id_fkey foreign KEY (meta_ad_id) references facebook_ads (meta_ad_id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_facebook_ad_caption_links_caption_text_id on public.facebook_ad_caption_links using btree (caption_text_id) TABLESPACE pg_default;

create index IF not exists idx_facebook_ad_caption_links_meta_ad_id on public.facebook_ad_caption_links using btree (meta_ad_id) TABLESPACE pg_default;

create table public.facebook_ad_description_links (
  meta_ad_id character varying(255) not null,
  description_text_id bigint not null,
  constraint facebook_ad_description_links_pkey primary key (meta_ad_id, description_text_id),
  constraint facebook_ad_description_links_description_text_id_fkey foreign KEY (description_text_id) references ad_creative_descriptions_text (description_text_id) on update CASCADE on delete RESTRICT,
  constraint facebook_ad_description_links_meta_ad_id_fkey foreign KEY (meta_ad_id) references facebook_ads (meta_ad_id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_facebook_ad_description_links_description_text_id on public.facebook_ad_description_links using btree (description_text_id) TABLESPACE pg_default;

create index IF not exists idx_facebook_ad_description_links_meta_ad_id on public.facebook_ad_description_links using btree (meta_ad_id) TABLESPACE pg_default;

create table public.facebook_ad_image_links (
  meta_ad_id character varying(255) not null,
  image_id bigint not null,
  constraint facebook_ad_image_links_pkey primary key (meta_ad_id, image_id),
  constraint facebook_ad_image_links_image_id_fkey foreign KEY (image_id) references ad_images (image_id) on update CASCADE on delete RESTRICT,
  constraint facebook_ad_image_links_meta_ad_id_fkey foreign KEY (meta_ad_id) references facebook_ads (meta_ad_id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_facebook_ad_image_links_image_id on public.facebook_ad_image_links using btree (image_id) TABLESPACE pg_default;

create index IF not exists idx_facebook_ad_image_links_meta_ad_id on public.facebook_ad_image_links using btree (meta_ad_id) TABLESPACE pg_default;

create table public.facebook_ad_reached_countries (
  meta_ad_id character varying(255) not null,
  country_code character(2) not null,
  constraint facebook_ad_reached_countries_pkey primary key (meta_ad_id, country_code),
  constraint facebook_ad_reached_countries_country_code_fkey foreign KEY (country_code) references countries (country_code) on update CASCADE on delete RESTRICT,
  constraint facebook_ad_reached_countries_meta_ad_id_fkey foreign KEY (meta_ad_id) references facebook_ads (meta_ad_id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_facebook_ad_reached_countries_country_code on public.facebook_ad_reached_countries using btree (country_code) TABLESPACE pg_default;

create index IF not exists idx_facebook_ad_reached_countries_meta_ad_id on public.facebook_ad_reached_countries using btree (meta_ad_id) TABLESPACE pg_default;

create table public.facebook_ad_title_links (
  meta_ad_id character varying(255) not null,
  title_text_id bigint not null,
  constraint facebook_ad_title_links_pkey primary key (meta_ad_id, title_text_id),
  constraint facebook_ad_title_links_meta_ad_id_fkey foreign KEY (meta_ad_id) references facebook_ads (meta_ad_id) on update CASCADE on delete CASCADE,
  constraint facebook_ad_title_links_title_text_id_fkey foreign KEY (title_text_id) references ad_creative_titles_text (title_text_id) on update CASCADE on delete RESTRICT
) TABLESPACE pg_default;

create index IF not exists idx_facebook_ad_title_links_meta_ad_id on public.facebook_ad_title_links using btree (meta_ad_id) TABLESPACE pg_default;

create index IF not exists idx_facebook_ad_title_links_title_text_id on public.facebook_ad_title_links using btree (title_text_id) TABLESPACE pg_default;

create table public.facebook_ads (
  meta_ad_id character varying(255) not null,
  page_id character varying(255) not null,
  delivery_start_time timestamp with time zone null,
  delivery_stop_time timestamp with time zone null,
  status character varying(50) null,
  media_type character varying(100) null,
  eu_total_reach bigint null,
  snapshot_url text null,
  snapshot_time timestamp with time zone not null default CURRENT_TIMESTAMP,
  ad_type public.ad_types not null default 'GENERAL_ADS'::ad_types,
  constraint facebook_ads_pkey primary key (meta_ad_id),
  constraint facebook_ads_meta_ad_id_unique unique (meta_ad_id),
  constraint facebook_ads_page_id_fkey foreign KEY (page_id) references facebook_pages (page_id) on update CASCADE on delete RESTRICT
) TABLESPACE pg_default;

create index IF not exists idx_facebook_ads_delivery_start_time on public.facebook_ads using btree (delivery_start_time) TABLESPACE pg_default;

create index IF not exists idx_facebook_ads_meta_ad_id on public.facebook_ads using btree (meta_ad_id) TABLESPACE pg_default;

create index IF not exists idx_facebook_ads_page_id on public.facebook_ads using btree (page_id) TABLESPACE pg_default;

create table public.facebook_pages (
  page_id character varying(255) not null,
  page_name character varying(255) not null,
  company_id bigint null,
  profile_picture_url text null,
  follower_count bigint null,
  first_seen_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint facebook_pages_pkey primary key (page_id),
  constraint facebook_pages_company_id_fkey foreign KEY (company_id) references companies (company_id) on update CASCADE on delete set null
) TABLESPACE pg_default;

create index IF not exists idx_facebook_pages_company_id on public.facebook_pages using btree (company_id) TABLESPACE pg_default;

create trigger set_facebook_pages_timestamp BEFORE
update on facebook_pages for EACH row
execute FUNCTION trigger_set_timestamp ('updated_at');

create table public.industries (
  industry_id bigserial not null,
  name character varying(255) not null,
  description text null,
  constraint industries_pkey primary key (industry_id),
  constraint industries_name_key unique (name)
) TABLESPACE pg_default;

create table public.offering_images (
  image_id bigserial not null,
  offering_id bigint not null,
  image_url text not null,
  alt_text text null,
  caption text null,
  display_order integer null,
  uploaded_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint offering_images_pkey primary key (image_id),
  constraint offering_images_offering_id_fkey foreign KEY (offering_id) references offerings (offering_id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_offering_images_offering_id on public.offering_images using btree (offering_id) TABLESPACE pg_default;

create table public.offerings (
  offering_id bigserial not null,
  company_id bigint not null,
  type character varying(50) not null,
  name character varying(255) not null,
  description text null,
  features text null,
  benefits text null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint offerings_pkey primary key (offering_id),
  constraint offerings_company_id_fkey foreign KEY (company_id) references companies (company_id) on update CASCADE on delete CASCADE,
  constraint offerings_type_check check (
    (
      (type)::text = any (
        array[
          ('Product'::character varying)::text,
          ('Service'::character varying)::text
        ]
      )
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_offerings_company_id on public.offerings using btree (company_id) TABLESPACE pg_default;

create trigger set_offerings_timestamp BEFORE
update on offerings for EACH row
execute FUNCTION trigger_set_timestamp ('updated_at');

create table public.target_audience_attributes (
  target_audience_id bigint not null,
  attribute_id bigint not null,
  constraint target_audience_attributes_pkey primary key (target_audience_id, attribute_id),
  constraint target_audience_attributes_attribute_id_fkey foreign KEY (attribute_id) references targeting_attributes (attribute_id) on update CASCADE on delete CASCADE,
  constraint target_audience_attributes_target_audience_id_fkey foreign KEY (target_audience_id) references target_audiences (target_audience_id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

create table public.target_audience_locations (
  target_audience_id bigint not null,
  country_code character(2) not null,
  location_details text null,
  constraint target_audience_locations_pkey primary key (target_audience_id, country_code),
  constraint target_audience_locations_country_code_fkey foreign KEY (country_code) references countries (country_code) on update CASCADE on delete CASCADE,
  constraint target_audience_locations_target_audience_id_fkey foreign KEY (target_audience_id) references target_audiences (target_audience_id) on update CASCADE on delete CASCADE
) TABLESPACE pg_default;

create table public.target_audiences (
  target_audience_id bigserial not null,
  company_id bigint not null,
  name character varying(255) not null,
  description text null,
  age_min integer null,
  age_max integer null,
  gender character varying(50) null,
  languages text null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint target_audiences_pkey primary key (target_audience_id),
  constraint target_audiences_company_id_fkey foreign KEY (company_id) references companies (company_id) on update CASCADE on delete CASCADE,
  constraint target_audiences_check check (
    (
      (age_min is null)
      or (age_max is null)
      or (age_min <= age_max)
    )
  )
) TABLESPACE pg_default;

create index IF not exists idx_target_audiences_company_id on public.target_audiences using btree (company_id) TABLESPACE pg_default;

create trigger set_target_audiences_timestamp BEFORE
update on target_audiences for EACH row
execute FUNCTION trigger_set_timestamp ('updated_at');

create table public.targeting_attributes (
  attribute_id bigserial not null,
  type character varying(100) not null,
  name character varying(255) not null,
  description text null,
  constraint targeting_attributes_pkey primary key (attribute_id),
  constraint targeting_attributes_type_name_key unique (type, name)
) TABLESPACE pg_default;

create table public.workspaces (
  workspace_id text not null,
  company_id bigint not null,
  created_at timestamp with time zone null default CURRENT_TIMESTAMP,
  updated_at timestamp with time zone null default CURRENT_TIMESTAMP,
  constraint workspaces_pkey primary key (workspace_id),
  constraint workspaces_company_id_fkey foreign KEY (company_id) references companies (company_id) on update CASCADE on delete RESTRICT
) TABLESPACE pg_default;

create index IF not exists idx_workspaces_company_id on public.workspaces using btree (company_id) TABLESPACE pg_default;

create trigger set_workspaces_timestamp BEFORE
update on workspaces for EACH row
execute FUNCTION trigger_set_timestamp ('updated_at');