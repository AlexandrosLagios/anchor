CREATE TABLE families (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT families_name_not_blank CHECK (char_length(btrim(name)) > 0)
);

CREATE TABLE family_members (
  family_id uuid NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (family_id, user_id),
  CONSTRAINT family_members_role_check CHECK (role IN ('owner', 'member'))
);

CREATE INDEX family_members_user_id_idx ON family_members (user_id);

CREATE TABLE family_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  family_id uuid NOT NULL REFERENCES families (id) ON DELETE CASCADE,
  email text NOT NULL,
  display_name text,
  invited_by uuid NOT NULL REFERENCES users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT family_invites_family_email_key UNIQUE (family_id, email)
);

CREATE INDEX family_invites_email_idx ON family_invites (email);
