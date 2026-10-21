-- Required by fixture synchronization upserts.
alter table competition_rounds add constraint competition_rounds_competition_name_key unique(competition_id,name);
