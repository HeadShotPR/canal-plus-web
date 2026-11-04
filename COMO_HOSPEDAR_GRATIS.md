# 🚀 Como Colocar o Canal+ Web no Ar (100% Grátis)

O projeto **Canal+ Web Player** foi criado com sucesso! Ele foi projetado para funcionar perfeitamente em:
- **Smart TVs Samsung** (pelo navegador de internet da TV)
- **Smart TVs LG** (pelo navegador de internet da TV)
- **Computadores, Notebooks e Celulares**
- **Controle remoto da TV** (navegação suave pelas setas Cima, Baixo, Esquerda, Direita e OK)

---

## 🎮 O que já está incluído:
1. **Aba Ao Vivo**: Todos os canais com logos, busca rápida e categorias.
2. **Aba Filmes**: Lançamentos e catálogo completo com sinopse, capa, avaliação e botão "Assistir".
3. **Aba Séries**: Temporadas e seletor de episódios.
4. **Aba Jogos Retrô**: Mais de 100 jogos retrô clássicos funcionando via emulador web embutido (compatível com gamepad e controle remoto).
5. **Aba Favoritos**: Salva os canais, filmes e séries favoritos direto na memória da TV.
6. **Controle Parental**: Bloqueio com PIN (padrão `0000`) para categorias e conteúdos adultos.
7. **Botão de WhatsApp**: Botão chamativo na tela de login direto para o seu contato.

---

## 🌐 Opção 1: Hospedar na Vercel (Recomendado - 2 minutos e Grátis)

A **Vercel** é a melhor opção porque o projeto já vem com a pasta `/api/proxy.js`, que remove qualquer bloqueio de CORS ou conexões HTTP nas Smart TVs.

1. Acesse **[vercel.com](https://vercel.com)** e crie uma conta gratuita (ou faça login com seu GitHub).
2. Clique em **"Add New..."** -> **"Project"**.
3. Arraste a pasta `canalplus-web` para lá (ou conecte com o seu repositório GitHub).
4. Clique em **Deploy**.
5. Pronto! Em 30 segundos você terá um link como:
   `https://seu-canal.vercel.app`

Agora é só o cliente abrir o navegador da TV Samsung ou LG, digitar esse link e fazer o login!

---

## 💻 Opção 2: Testar Localmente no seu Computador

Se você quiser ver o site funcionando agora mesmo no seu computador:
1. Abra o arquivo `index.html` em qualquer navegador (Google Chrome, Edge, etc.).
2. Ou inicie um servidor local se tiver Node.js / Python instalado.
