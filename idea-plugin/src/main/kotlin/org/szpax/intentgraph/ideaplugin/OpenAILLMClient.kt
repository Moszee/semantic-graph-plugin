package org.szpax.intentgraph.ideaplugin

import com.openai.client.OpenAIClient
import com.openai.client.okhttp.OpenAIOkHttpClient
import com.openai.models.ChatModel
import com.openai.models.chat.completions.*
import com.openai.core.JsonValue
import com.openai.models.FunctionDefinition
import com.openai.models.FunctionParameters
import com.fasterxml.jackson.core.type.TypeReference
import com.fasterxml.jackson.databind.ObjectMapper
import org.szpax.intentgraph.library.client.ChatClient
import org.szpax.intentgraph.library.client.ChatMessage
import org.szpax.intentgraph.library.client.ChatRole
import org.szpax.intentgraph.library.client.ToolCall
import org.szpax.intentgraph.library.client.ToolDefinition

class OpenAILLMClient(
    private val apiKey: String,
    private val model: String = "gpt-4o",
    private val baseUrl: String = "https://api.openai.com/v1"
) : ChatClient {

    private val json = ObjectMapper()

    private val client: OpenAIClient = OpenAIOkHttpClient.builder()
        .apiKey(apiKey)
        .baseUrl(baseUrl)
        .build()

    override fun complete(messages: List<ChatMessage>, tools: List<ToolDefinition>): ChatMessage {
        val params = ChatCompletionCreateParams.builder()
            .model(ChatModel.of(model))
            .messages(messages.map { it.toOpenAiParam() })
            .tools(tools.map { it.toOpenAiTool() })
            .toolChoice(
                ChatCompletionToolChoiceOption.ofAuto(
                    ChatCompletionToolChoiceOption.Auto.AUTO
                )
            )
            .build()

        val completion = client.chat().completions().create(params)
        val message = completion.choices().firstOrNull()?.message()
        if (message == null) {
            return ChatMessage.assistant("", emptyList())
        }

        val toolCalls = message.toolCalls().orElse(emptyList()).mapNotNull { call ->
            if (!call.isFunction()) return@mapNotNull null
            val fn = call.asFunction()
            val argsJson = fn.function().arguments()
            val args: Map<String, Any?> = if (argsJson.isBlank()) {
                emptyMap()
            } else {
                json.readValue(argsJson, object : TypeReference<Map<String, Any?>>() {})
            }
            ToolCall(fn.id(), fn.function().name(), args)
        }

        val content = message.content().orElse("")
        return ChatMessage.assistant(content, toolCalls)
    }

    private fun ChatMessage.toOpenAiParam(): ChatCompletionMessageParam {
        return when (role) {
            ChatRole.SYSTEM -> ChatCompletionMessageParam.ofSystem(
                ChatCompletionSystemMessageParam.builder().content(content ?: "").build()
            )

            ChatRole.USER -> ChatCompletionMessageParam.ofUser(
                ChatCompletionUserMessageParam.builder().content(content ?: "").build()
            )

            ChatRole.ASSISTANT -> {
                val builder = ChatCompletionAssistantMessageParam.builder()
                if (!content.isNullOrBlank()) {
                    builder.content(content)
                }
                val tc = toolCalls.orEmpty()
                if (tc.isNotEmpty()) {
                    builder.toolCalls(tc.map { it.toOpenAiToolCall() })
                }
                ChatCompletionMessageParam.ofAssistant(builder.build())
            }

            ChatRole.TOOL -> ChatCompletionMessageParam.ofTool(
                ChatCompletionToolMessageParam.builder()
                    .toolCallId(toolCallId ?: "")
                    .content(content ?: "")
                    .build()
            )
        }
    }

    private fun ToolCall.toOpenAiToolCall(): ChatCompletionMessageToolCall {
        val function = ChatCompletionMessageFunctionToolCall.Function.builder()
            .name(name)
            .arguments(json.writeValueAsString(arguments ?: emptyMap<String, Any?>()))
            .build()

        val functionCall = ChatCompletionMessageFunctionToolCall.builder()
            .id(id)
            .function(function)
            .build()

        return ChatCompletionMessageToolCall.ofFunction(functionCall)
    }

    private fun ToolDefinition.toOpenAiTool(): ChatCompletionTool {
        val parameters = FunctionParameters.builder().apply {
            parametersSchema.forEach { (k, v) ->
                putAdditionalProperty(k, JsonValue.from(v))
            }
        }.build()

        val functionDef = FunctionDefinition.builder()
            .name(name)
            .description(description)
            .parameters(parameters)
            .build()

        val fnTool = ChatCompletionFunctionTool.builder()
            .function(functionDef)
            .build()

        return ChatCompletionTool.ofFunction(fnTool)
    }
}
