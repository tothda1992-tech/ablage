begin;
insert into public.products(id,code,rate,position,excel_row) values
('rollo','ROLLO',391,'accessory',6),('polc','POLC',26,'accessory',7),('tukor','TÜKÖR',40,'accessory',8),
('product_3143','3143',1481,'upper',10),('product_3243','3243',1638,'upper',11),('product_3343','3343',1638,'upper',12),('product_3443','3443',1638,'upper',13),('product_3543','3543',1638,'upper',14),
('product_3474','3474',2148,'upper',17),('product_3574','3574',2148,'upper',18),('product_3674','3674',2148,'upper',19),('product_3774','3774',2148,'upper',20),('product_3874','3874',2174,'upper',21),('product_3974','3974',2174,'upper',22),
('product_4074','4074',1998,'upper',25),('product_4174','4174',1998,'upper',26),('product_4274','4274',1998,'upper',27),('product_4374','4374',1998,'upper',28),('product_4474','4474',2024,'upper',29),('product_4574','4574',2024,'upper',30),
('product_4443','4443',1481,'upper',33),('product_4543','4543',1638,'upper',34),('product_4643','4643',1638,'upper',35),('product_4743','4743',1638,'upper',36),('product_4843','4843',1638,'upper',37),('germersheim_upper','GERM felső',1756,'upper',38),
('product_4674','7374',1076,'lower',41),('product_4774','7474',1076,'lower',42),('product_4874','7574',1598,'lower',43),('product_4974','7674',1598,'lower',44),('product_5074','7774',1467,'lower',45),('product_5174','5174',1467,'lower',46),('product_5274','7974',1989,'lower',47),('product_5374','8074',1989,'lower',48),
('product_4943','6974',1004,'lower',51),('product_5043','7074',1004,'lower',52),('product_5143','7174',1526,'lower',53),('product_5243','7274',1526,'lower',54),('germersheim_lower','GERM alsó',1399,'lower',56);
insert into public.downtime_categories(id,label,excel_row) values
('downtime_61','Hátlap,bft, egyéb....csere',61),('downtime_62','Adapter, kocsi várás',62),('downtime_63','Várakozás BFT, Auftrag',63),('downtime_64','Takarítás',64),('downtime_65','WAW',65),('downtime_66','Zsanér csövezés',66),('downtime_67','Asistant ,Brazil dobozolás',67);
commit;
