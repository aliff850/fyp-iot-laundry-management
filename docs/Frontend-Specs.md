I would like to update frontend-web but I want to first specify and confirm the flow first and have it jotted down in a PRD file.



The frontend-web directory would be the place for the operator web and progressive web app (PWA). The rough flow for the operator app would be as follows:



Login/registration page -> main dashboard/overview of all branches -> specific branch dashboard/overview with metrics and statistics -> sidebar -> machines/lpg telemetry/revenue/account/assigned personnel



\-- Login/registration --



The login page is simple, there will only be a field to enter email and password.



For registration, there will be two different types of accounts. One for business owner, one for a personnel account. There will be an option to select between business owner/personnel.



Basically a laundry business owner can register an account and their company/organization. They enter their name, email, number and company/organization name and click register. Once registered, redirect to login and they can login.



HOWEVER, there will also be a registration for personnel under an organization. Basically if they choose to register as personnel, they first are prompted to choose organization from a list of registered organizations that a business owner has previously registered (from a list or dropdown). Once they selected the correct organization they can then enter their details such as name, phone number and email. Once registered, they will also be redirected to login.



\-- Main dashboard/overview --



Once the user has registered and logged in, they will get directed to the main branch dashboard page. 



At the top of the page there would be three navigation items; 

\- First is branches (the main page)

\- Second is Personnel (view and manage all personnel in organization)

\- Third is account where they can manage their account details. 



All three are accessible for the newly registered business owner. 



However, for a regular personnel, they will only have access to main page and account page.



All three pages/views in the main dashboard is as follows:

**a. Main Dashboard**

This is the first page the user is redirected to after logging in.



In the main dashboard page for a registered owner, there will be the following set of sections:

1\. Notifications

At the top of the page below the navigation there will be a notifications/messages area that shows any notifications, like machine breakdown, machine maintenance, low LPG gas warning, gas leak warning, customer reports etc. This is notifications across all different branches.



2\. Statistics

Below the notification, there would be different basic number statistics; number of branches, number of personnel, number of machines across all branches etc.



3\. Map and list of branches

Beneath this, there would be an interactive map (possibly powered by Google Maps) that shows all different branches that the owner has registered. Beneath this map or maybe besides this map to the right (maybe the map takes half width of the element on the left), will be all list of registered branches. The map and the list would be blank or display "no branches registered" if the owner has no branches. There will be a button to "register new branch".



There is an option to create a new branch/shop. Once clicked, it will open a modal or page that prompts them to enter branch name, branch address (with a map to manually locate and pin if address not found), then they have an additional pop up to assign a branch manager, where they can select from a list of registered personnel under their organization. However, they can also select themselves to be the branch manager.



4\. Visualizations

Beneath this, maybe some charts or visuals?? Number of active machines, number of broken down machines, revenue etc. for all branches, which can be set to daily, weekly, monthly etc.



Meanwhile, for newly registered personnel who are unassigned, they will only be able to view the main dashboard page with nothing until they have been assigned (maybe a message saying you are currently not assigned to any branch). The registered personnel cannot view statistics and the visuals. They will only have the interactive map along with list of branches. They can be assigned to more than one branch.



Clicking on the branch in the list of branches will lead the owner/personnel to the branch overview page!



b. Personnel

This page will show a list (list cards) of all registered personnel in the organization created by the business owner.

Regular personnel besides business owner will not get access to this page.



Shows their details like name, email, role in organization, branches assigned to.



There will be a modal that enables business owner to change role.



Business owner has ability to change role/remove person from organization.



c. Account

This page enables all users to edit their account details.



This includes name, email, password etc.



However, personnel under an organization cannot change their organization here. Only a business owner can remove them from organization.



In addition, business owners can change the details of their organization here (organization name etc) or they can delete their account and organization. 



Any personnel under an organization will be removed and deactivated too (need to figure out a way here).



\-- The Branch Overview --

The branch overview provides all details regarding a specific branch.

Top of page shows branch name and address.

Beneath this, is notifications section that shows notifications for this specific branch, once again could be a machine breakdown, machine maintenance, low LPG gas warning, gas leak warning etc.

Beneath this section, there will once again be some basic number stats; number of machines, number of machines active, machines down, personnel assigned to this branch, number of customer reports received.

Below that will be visuals and charts; cumulative water usage, cumulative gas usage, cumulative machine usage (cycles), cumulative revenue.

The branch overview has multiple different views. The first page would be an overview page showing the specific branch metrics such as for example maybe number of machines, number of gas tanks, number of employees. Then below that will be statistics, such as for example water usage, gas usage, and revenue.

Owner and Branch manager (employee assigned to manage branch) will be able to see these statistics. However, maintenance personnel (laundry machine \& gas company employees) would not be able to see this they only have access to specific pages which will be detailed further.

On left side of page, would be a navigation menu which has multiple different items;

\-Machine overview

\-LPG overview

\-Customer Reports

\-Branch Personnel

\-Branch Details



1\. Machine Overview:

The machine overview page provides an overview of all machines within a specific branch.

Top of page will have notifications; showing specific messages for each machine (for example: dryer #1 down, washer #1 undergoing maintenance).

&#x20;

Beneath notifications will be basic statistics; machines in branch, machines running, machines down.

Beneath this section, a grid with cards for each machine in the branch. The grid responds to screen size; for large screens (laptops/PCs) it would have four columns.

Above the grid, there will be options to display dryers, washers, or washer/dryer combos.

Each machine card would have:

A title showing machine name (Washer #1, Dryer #1 etc)

A full sized SVG image that represents the machine.

A section beneath that showing machine status (idle, running, error)

A section showing remaining cycle time

Section showing three buttons to start pause or stop a machine.


When a card is clicked, it would open a almost full-page modal. The modal would have three different views. 



The first view is the machine state; a section showing full remaining cycle time, temperature, and RPM, basic stats.

Beneath this section showing stats is the statistics showing graphs for income, work time, and also number of cycles.



The second view is programs; basically the machine's wash/drying programs and also the price.



The third view is the machine's parameters (there's a lot so for now it won't be listed here).



2\. LPG \& Safety:

The LPG overview page provides overview and state of all LPG gas tanks for dryers in a branch, using data supplied from an ESP32 edge node utilizing load cells wired to a HX711 amp, a MQ-6 sensor and also a DHT-22 sensor.



Top of page will again show notifications; example LPG tank #1 running low, LPG tank #1 undergoing replacement etc.



Following section shows basic statistics; cumulative LPG gas percentage, cumulative gas PPM level, temperature and humidity.



Beneath statistics, will be a grid section with cards for each LPG gas tank in a branch; however unlike machines this is a fixed amount, usually 4 to 5 (probably will stick with 4 gas tanks) because we cannot simply add another gas tank in a branch.



For each gas tank card:

There will be a title (LPG #1, LPG #2 etc)

Beneath title will be status (normal, low etc)

Beneath that will be an SVG of a gas tank with the percentage level shown.

Beneath the SVG will be gas leak (PPM) concentration.

Beneath PPM will be the service mode to change the LPG tank.



3\. Customer Reports

Customer reports page just shows a list of reports made by the customers (reporting malfunctioning machine etc)



The page just displays a list of all reports by customers with actions to investigate them somehow.



4\. Branch Personnel

Lists all personnel assigned to this branch, similar to the personnel page in the main dashboard. 

Here business owner can reassign personnel to different roles, remove personnel from the branch.

Regular personnel cannot access this page.



5\. Branch details

Not entirely sure if this is needed. Will enable business owner to edit details, like maybe branch name, address etc.



\-- The different roles --



1. Admin

Admin gets access to everything. In main dashboard, there will be special page for admin that shows all registered organizations and all registered users (owners, branch managers etc)



2\. Business Owner

Gets access to almost everything apart from that special page admins get.



3\. Branch manager

In main dashboard, only gets access to list of branches they are assigned to. 

In branch dashboard, they get access to everything.



4\. Maintenance

Only has access to the Machine Overview page.



5\. LPG maintenance

Only has access to LPG \& Safety to do maintenance related to LPG tanks.



