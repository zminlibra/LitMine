// LitMine Neo4j Constraints and Indexes
// Run this script with: cypher-shell -f init-neo4j.cypher

// ── Constraints (unique IDs) ──
CREATE CONSTRAINT paper_doi IF NOT EXISTS FOR (p:Paper) REQUIRE p.doi IS UNIQUE;
CREATE CONSTRAINT author_name_orcid IF NOT EXISTS FOR (a:Author) REQUIRE a.name IS UNIQUE;
CREATE CONSTRAINT institution_name IF NOT EXISTS FOR (i:Institution) REQUIRE i.name IS UNIQUE;
CREATE CONSTRAINT concept_name IF NOT EXISTS FOR (c:Concept) REQUIRE c.name IS UNIQUE;
CREATE CONSTRAINT method_name IF NOT EXISTS FOR (m:Method) REQUIRE m.name IS UNIQUE;
CREATE CONSTRAINT organism_name IF NOT EXISTS FOR (o:Organism) REQUIRE o.name IS UNIQUE;
CREATE CONSTRAINT gene_symbol IF NOT EXISTS FOR (g:Gene) REQUIRE g.symbol IS UNIQUE;
CREATE CONSTRAINT protein_name IF NOT EXISTS FOR (pr:Protein) REQUIRE pr.name IS UNIQUE;
CREATE CONSTRAINT project_id IF NOT EXISTS FOR (prj:Project) REQUIRE prj.id IS UNIQUE;

// ── Indexes ──
CREATE INDEX paper_year IF NOT EXISTS FOR (p:Paper) ON (p.year);
CREATE INDEX paper_source IF NOT EXISTS FOR (p:Paper) ON (p.source);
CREATE INDEX author_name_idx IF NOT EXISTS FOR (a:Author) ON (a.name);
CREATE INDEX concept_frequency IF NOT EXISTS FOR (c:Concept) ON (c.frequency_in_corpus);
CREATE INDEX organism_domain IF NOT EXISTS FOR (o:Organism) ON (o.domain);

// ── Full-text Index for search ──
CREATE FULLTEXT INDEX paper_text IF NOT EXISTS
FOR (p:Paper) ON EACH [p.title, p.abstract];

CREATE FULLTEXT INDEX concept_text IF NOT EXISTS
FOR (c:Concept) ON EACH [c.name, c.description];
