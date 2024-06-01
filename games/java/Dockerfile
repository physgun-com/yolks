FROM ubuntu:20.04

LABEL author="Stepan Fedotov <stepan@wisp.gg>" maintainer="Anthony <anthony@physgun.com>"
ARG DEBIAN_FRONTEND=noninteractive
ENV LANG='en_US.UTF-8' LANGUAGE='en_US:en' LC_ALL='en_US.UTF-8'

RUN apt-get update -y && \
    apt-get install -y tzdata curl wget ca-certificates software-properties-common apt-transport-https fontconfig locales openssl git tar sqlite iproute2 python3 && \
    echo "en_US.UTF-8 UTF-8" >> /etc/locale.gen && \
    locale-gen en_US.UTF-8 && \
    add-apt-repository -y ppa:openjdk-r/ppa && \
    wget -O - https://apt.corretto.aws/corretto.key | sudo gpg --dearmor -o /usr/share/keyrings/corretto-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/corretto-keyring.gpg] https://apt.corretto.aws stable main" | sudo tee /etc/apt/sources.list.d/corretto.list && \
    apt-get update -y && \
    apt-get install -y openjdk-8-jre openjdk-11-jre openjdk-16-jre openjdk-17-jre java-21-amazon-corretto-jdk libxi6 libxtst6 libxrender1 && \
    rm -rf /var/lib/apt/lists/*

RUN ln -s /usr/lib/jvm/java-8-openjdk-$(dpkg --print-architecture)/jre/bin/java /usr/local/bin/java8 && \
    ln -s /usr/lib/jvm/java-11-openjdk-$(dpkg --print-architecture)/bin/java /usr/local/bin/java11 && \
    ln -s /usr/lib/jvm/java-16-openjdk-$(dpkg --print-architecture)/bin/java /usr/local/bin/java16 && \
    ln -s /usr/lib/jvm/java-17-openjdk-$(dpkg --print-architecture)/bin/java /usr/local/bin/java17 && \
    ln -s /usr/lib/jvm/java-21-amazon-corretto/bin/java /usr/local/bin/java21 && \
    useradd -d /home/container -m container

USER container
ENV USER=container HOME=/home/container

WORKDIR /home/container

COPY ./prompt.py /prompt.py
COPY ./entrypoint.sh /entrypoint.sh
CMD [ "/bin/bash", "/entrypoint.sh" ]
