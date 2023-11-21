export default class TeachersSQL {
  constructor() {
    this.sql = `
BEGIN TRANSACTION;
CREATE TABLE IF NOT EXISTS "teacher" (
	"id"	int(11) NOT NULL,
	"dept"	int(11) DEFAULT NULL,
	"name"	varchar(50) DEFAULT NULL,
	"phone"	varchar(50) DEFAULT NULL,
	"mobile"	varchar(50) DEFAULT NULL,
	PRIMARY KEY("id")
);
CREATE TABLE IF NOT EXISTS "dept" (
	"id"	int(11) NOT NULL,
	"name"	varchar(50) DEFAULT NULL,
	PRIMARY KEY("id")
);
INSERT INTO "teacher" VALUES (101,1,'Shrivell','2753','07986 555 1234'),
 (102,1,'Throd','2754','07122 555 1920'),
 (103,1,'Splint','2293',NULL),
 (104,NULL,'Spiregrain',NULL,NULL),
 (105,2,'Cutflower','3212','07996 555 6574'),
 (106,NULL,'Deadyawn','3345',NULL);
INSERT INTO "dept" VALUES (1,'Computing'),
 (2,'Design'),
 (3,'Engineering');
COMMIT;`;
  }
}