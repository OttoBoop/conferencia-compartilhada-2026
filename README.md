# Consulta protegida

Interface estática para revisão compartilhada de documentos e elaboração de minutas.

Os dados e anexos deste repositório são criptografados. A senha não integra o repositório nem a URL. Revisões humanas são armazenadas e trocadas em arquivos criptografados; não há servidor de sincronização. O Python de síntese roda em Web Worker no navegador, após a abertura da consulta.

Criptografia: AES-256-GCM, nonce aleatório por arquivo, chave derivada por PBKDF2-HMAC-SHA-256 com salt aleatório e 600.000 iterações.
