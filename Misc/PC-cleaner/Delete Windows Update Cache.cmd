@echo off
echo (c) Copyright ZOHAIB ROCK.
net stop wuauserv
net stop UsoSvc
rd /s /q C:\Windows\SoftwareDistribution
md C:\Windows\SoftwareDistribution
echo (c) Copyright ZOHAIB ROCK.
pause