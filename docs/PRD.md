# Product Requirements Document

## Purpose
ManufactureOS is a web ERP for small-to-medium discrete manufacturers. The MVP demonstrates an auditable end-to-end lifecycle from production demand through BOM planning, purchasing, inventory, manufacturing, quality, and cost reporting.

## Users
- Super administrator: manage access and configuration.
- Engineering: maintain items, routings, and BOM revisions.
- Planner: plan demand and release manufacturing orders.
- Purchasing: manage suppliers, purchase requests, and orders.
- Warehouse: receive, reserve, transfer, issue, and adjust stock.
- Operator: execute assigned work orders.
- QC inspector: inspect output and disposition defects.
- Management: review operational and cost reports.

## MVP requirements
- One company and plant; multiple logical warehouse locations.
- Precise decimal quantities and monetary amounts; IDR presentation; timestamps stored in UTC and shown in Asia/Jakarta.
- Role/permission-controlled actions, audit history, immutable posted inventory ledger, and transaction-safe stock operations.
- Item, UOM, supplier, location, work center, routing, revisioned multilevel BOM, time-phased MRP, procurement, manufacturing execution, QC, costing, and operational reports.
- Closed account provisioning; administrator-created users only.
- Responsive accessible desktop-first interface.

## MVP exclusions
General ledger, payroll, tax filing, multi-company consolidation, advanced APS, IoT, warehouse automation, AI forecasting, microservices, Kafka, Kubernetes, complex multitenancy, and native mobile apps.

## Acceptance principle
A capability is not complete until its business rules are enforced server-side, data is persisted, authorization and validation exist, errors are handled, automated tests pass, and relevant documentation reflects actual behavior. Static sample dashboards do not meet acceptance.
