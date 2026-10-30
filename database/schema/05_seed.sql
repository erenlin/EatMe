create extension if not exists pgcrypto;

select * from usp_new_user('Wei Ling',  'Tan',       'weiling.tan@example.com',   crypt('password123', gen_salt('bf', 12)), '+6591234567', '1998-03-14', 'Female');
select * from usp_new_user('Marcus',    'Lim',       'marcus.lim@example.com',    crypt('password123', gen_salt('bf', 12)), '+6598765432', '1995-07-22', 'Male');
select * from usp_new_user('Priya',     'Nair',      'priya.nair@example.com',    crypt('password123', gen_salt('bf', 12)), '+6582345678', '2001-11-05', 'Female');
select * from usp_new_user('Ahmad',     'Rahman',    'ahmad.rahman@example.com',  crypt('password123', gen_salt('bf', 12)), null,          '1990-01-30', 'Male');
select * from usp_new_user('Sophie',    'Chen',      'Sophie.Chen@Example.com',   crypt('password123', gen_salt('bf', 12)), '+12065550142', '2000-06-18', 'Female');
select * from usp_new_user('Daniel',    'Okafor',    'daniel.okafor@example.com', crypt('password123', gen_salt('bf', 12)), '+12065550187', '1997-09-09', 'Male');
select * from usp_new_user('Alex',      'Morgan',    'alex.morgan@example.com',   crypt('password123', gen_salt('bf', 12)), '',            '2003-02-25', 'Others');
select * from usp_new_user('Hui Min',   'Goh',       'huimin.goh@example.com',    crypt('password123', gen_salt('bf', 12)), '+6587654321', '1988-12-01', 'Female');
select * from usp_new_user('Kenji',     'Watanabe',  'kenji.watanabe@example.com', crypt('password123', gen_salt('bf', 12)), '+6593456789', '1993-04-17', 'Male');
select * from usp_new_user('Isabella',  'Rossi',     'isabella.rossi@example.com', crypt('password123', gen_salt('bf', 12)), '+12065550123', '1999-08-28', 'Female');